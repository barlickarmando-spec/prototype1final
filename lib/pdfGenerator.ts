import jsPDF from 'jspdf';
import type { StateResult, UserInputs } from './affordability';
import { getStateByName, getHouseholdCost } from './affordability';

// Import autoTable function from jspdf-autotable v5
import { autoTable } from 'jspdf-autotable';

// Extend jsPDF type to include lastAutoTable
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: {
      finalY: number;
    };
  }
}

interface YearlyBreakdown {
  year: number;
  age: number;
  debtPayment: number;
  savingsForHome: number;
  totalAllocated: number;
  remainingDebt: number;
  homeSavings: number;
  netWorth: number;
  notes: string[];
}

interface HomeSizeOption {
  size: 'small' | 'medium' | 'large' | 'veryLarge';
  label: string;
  homeValue: number;
  yearsToHome: number | null;
  viable: boolean;
}

// Calculate annual mortgage payment using PMT formula
function calculateAnnualMortgagePayment(
  homeValue: number,
  mortgageRate: number,
  downPaymentPercent: number
): number {
  if (homeValue <= 0 || mortgageRate <= 0) return 0;
  
  const downPayment = homeValue * downPaymentPercent;
  const principal = homeValue - downPayment;
  if (principal <= 0) return 0;
  
  const monthlyRate = mortgageRate / 12;
  const numPayments = 30 * 12; // 30 years
  const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
    (Math.pow(1 + monthlyRate, numPayments) - 1);
  
  return monthlyPayment * 12; // Annual payment
}

export function generateYearlyBreakdown(
  result: StateResult,
  inputs: UserInputs,
  maxYears: number = 30
): YearlyBreakdown[] {
  const breakdown: YearlyBreakdown[] = [];
  const currentAge = inputs.age || 25;
  
  let remainingDebt = inputs.studentLoanBalance || 0;
  let homeSavings = 0;
  let netWorth = 0;
  
  // Get state for dynamic cost of living calculations
  const state = getStateByName(result.state);
  
  // Calculate annual mortgage payment
  const annualMortgagePayment = calculateAnnualMortgagePayment(
    result.homeValue,
    result.mortgageRate,
    result.downPaymentPercent
  );
  
  const debtFreeYear = result.yearsToDebtFree || null;
  const homeYear = result.yearsToHome || null;
  const downPayment = result.homeValue * result.downPaymentPercent;
  const savingsRate = inputs.savingsRate || 0;
  
  // Track number of kids dynamically
  let currentKids = inputs.kids;
  
  for (let year = 1; year <= maxYears; year++) {
    const age = currentAge + year - 1;
    const notes: string[] = [];
    
    // Update number of kids based on future child ages
    if (inputs.advanced?.futureKids) {
      if (inputs.advanced.firstChildAge && age >= inputs.advanced.firstChildAge) {
        currentKids = Math.max(currentKids, 1);
      }
      if (inputs.advanced.secondChildAge && age >= inputs.advanced.secondChildAge) {
        currentKids = Math.max(currentKids, 2);
      }
    }
    
    // Recalculate cost of living based on current number of kids
    let currentCostOfLiving = result.disposableIncome ? 
      (result.combinedIncome - result.disposableIncome) : 0;
    if (state && currentKids !== inputs.kids) {
      currentCostOfLiving = getHouseholdCost(state, inputs.householdType, currentKids);
    }
    
    // Recalculate disposable income with updated cost of living
    let currentDisposable = result.combinedIncome - currentCostOfLiving;
    
    // Account for mortgage payment if home is purchased
    if (homeYear !== null && year > homeYear) {
      currentDisposable -= annualMortgagePayment;
    }
    
    // Account for partner joining (if applicable)
    let currentIncome = result.combinedIncome;
    if (inputs.householdType === 'marriedTwoIncome' && inputs.advanced?.partnerAge && 
        age >= inputs.advanced.partnerAge && inputs.advanced.partnerTiming !== 'already') {
      // Partner joins - income increases (already in combinedIncome, but we track the change)
      if (year === Math.ceil(inputs.advanced.partnerAge - currentAge + 1)) {
        notes.push('💰 Partner joins household - Income increases');
      }
    }
    
    // Calculate annual payments based on current disposable income
    const debtPaymentAnnual = currentDisposable > 0 ? 
      currentDisposable * result.minDebtPercent : 0;
    const savingsAnnual = currentDisposable > 0 ? 
      currentDisposable * result.savingsPercent : 0;
    
    // Calculate debt payment and remaining debt
    if (remainingDebt > 0 && (debtFreeYear === null || year <= debtFreeYear)) {
      const interest = remainingDebt * (inputs.studentLoanRate || 0);
      const principalPayment = Math.max(0, debtPaymentAnnual - interest);
      remainingDebt = Math.max(0, remainingDebt - principalPayment);
      
      if (remainingDebt <= 0 && debtFreeYear !== null && year === Math.ceil(debtFreeYear)) {
        notes.push('✓ Debt-free milestone reached');
      }
    } else {
      remainingDebt = 0;
    }
    
    // Calculate home savings and mortgage payments
    if (homeYear !== null && year <= homeYear) {
      // Before home purchase - saving for down payment
      homeSavings = (homeSavings + savingsAnnual) * (1 + savingsRate);
      if (year === Math.ceil(homeYear)) {
        notes.push('✓ Down payment saved - Ready for home purchase');
      }
    } else if (homeYear !== null && year > homeYear) {
      // After home purchase - paying mortgage, building equity
      const homeEquityGrowth = result.homeValue * 0.03; // Estimated 3% annual appreciation
      // Mortgage payment reduces savings, but equity grows
      homeSavings = Math.max(0, homeSavings - annualMortgagePayment + savingsAnnual) * (1 + savingsRate) + homeEquityGrowth;
      if (year === Math.ceil(homeYear) + 1) {
        notes.push('✓ Home purchased - Building equity');
      }
    } else {
      // No viable path yet, but still track savings
      homeSavings = (homeSavings + savingsAnnual) * (1 + savingsRate);
    }
    
    // Check for milestone events
    if (inputs.advanced?.firstChildAge && age === inputs.advanced.firstChildAge) {
      notes.push('⚠️ First child arrives - Cost of living increases');
    }
    
    // Calculate net worth (home equity - remaining debt + savings)
    const homeEquity = (homeYear !== null && year > homeYear) ? 
      (result.homeValue * 0.03 * (year - Math.ceil(homeYear))) : 0;
    netWorth = homeSavings - remainingDebt + homeEquity;
    
    // Calculate total allocated (debt + savings + mortgage if applicable)
    let mortgagePayment = 0;
    if (homeYear !== null && year > homeYear) {
      mortgagePayment = annualMortgagePayment;
    }
    
    breakdown.push({
      year,
      age,
      debtPayment: year <= (debtFreeYear || 0) ? debtPaymentAnnual : 0,
      savingsForHome: year <= (homeYear || maxYears) ? savingsAnnual : 0,
      totalAllocated: (year <= (debtFreeYear || 0) ? debtPaymentAnnual : 0) + 
                     (year <= (homeYear || maxYears) ? savingsAnnual : 0) +
                     mortgagePayment,
      remainingDebt: Math.max(0, remainingDebt),
      homeSavings: Math.max(0, homeSavings),
      netWorth,
      notes,
    });
  }
  
  return breakdown;
}

function calculateYearsToHome(
  annualSavings: number,
  savingsRate: number,
  targetDownPayment: number
): number | null {
  if (annualSavings <= 0) return null;
  let balance = 0;
  for (let year = 1; year <= 80; year++) {
    balance = (balance + annualSavings) * (1 + savingsRate);
    if (balance >= targetDownPayment) return year;
  }
  return null;
}

function calculateHomeSizeOptions(
  result: StateResult,
  inputs: UserInputs
): HomeSizeOption[] {
  const state = getStateByName(result.state);
  if (!state) return [];
  
  const homeSizeMap: Array<{ size: HomeSizeOption['size']; key: string; label: string }> = [
    { size: 'small', key: 'typical_home_value_small', label: 'Small' },
    { size: 'medium', key: 'typical_home_value_single_family_normal', label: 'Medium' },
    { size: 'large', key: 'typical_home_value_large', label: 'Large' },
    { size: 'veryLarge', key: 'typical_home_value_very_large', label: 'Very Large' },
  ];
  
  const stateData = state as Record<string, unknown>;
  const annualSavings = result.disposableIncome * result.savingsPercent;
  const savingsRate = inputs.savingsRate || 0;
  const downPaymentPercent = result.downPaymentPercent || 0.2;
  
  return homeSizeMap.map(({ size, key, label }) => {
    const homeValue = safeNumber(stateData[key]);
    const downPayment = homeValue * downPaymentPercent;
    const yearsToHome = calculateYearsToHome(annualSavings, savingsRate, downPayment);
    
    return {
      size,
      label,
      homeValue,
      yearsToHome,
      viable: yearsToHome !== null && yearsToHome <= 50,
    };
  });
}

function safeNumber(value: unknown): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  return 0;
}

function drawSimpleBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  values: number[],
  labels: string[],
  maxValue: number
): void {
  const barWidth = (width - (values.length - 1) * 5) / values.length;
  let currentX = x;
  
  values.forEach((value, idx) => {
    const barHeight = maxValue > 0 ? (value / maxValue) * height : 0;
    const yPos = y + height - barHeight;
    
    // Draw bar
    doc.setFillColor(30, 58, 138);
    doc.rect(currentX, yPos, barWidth, barHeight, 'F');
    
    // Draw label
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(labels[idx], currentX + barWidth / 2, y + height + 5, { align: 'center' });
    
    // Draw value
    doc.text(
      value.toFixed(1) + (labels[idx].includes('%') ? '' : ''),
      currentX + barWidth / 2,
      yPos - 3,
      { align: 'center' }
    );
    
    currentX += barWidth + 5;
  });
}

export async function generateStatePDF(
  result: StateResult,
  inputs: UserInputs,
  recommendations: Array<{ text: string }>
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 20;
  const margin = 14;
  const contentWidth = pageWidth - 2 * margin;
  
  // Helper function to check if new page is needed
  const checkNewPage = (requiredSpace: number) => {
    if (yPos + requiredSpace > pageHeight - 20) {
      doc.addPage();
      yPos = 20;
      return true;
    }
    return false;
  };
  
  // Title
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.text(`${result.state} Financial Plan`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;
  
  // Subtitle
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Affordability Planner - ${new Date().toLocaleDateString()}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;
  
  // Divider line
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 12;

  // ========================================================================
  // PHASE 1: EXECUTIVE SUMMARY BOX (Must appear before any tables)
  // ========================================================================
  checkNewPage(50);
  
  // Draw executive summary box
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, yPos, contentWidth, 45, 3, 3, 'FD');
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.text('Executive Summary', margin + 8, yPos + 10);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  // Build executive summary paragraph
  const homeTimeline = result.yearsToHome !== null 
    ? `you can realistically purchase a home in approximately ${result.yearsToHome.toFixed(1)} years`
    : `home ownership is not achievable under current assumptions`;
  
  const debtTimeline = result.yearsToDebtFree !== null
    ? `become debt-free in ${result.yearsToDebtFree.toFixed(1)} years`
    : `debt freedom is not achievable under current assumptions`;
  
  const stabilityNote = result.classification === 'Very viable and stable' || result.classification === 'Viable'
    ? 'while maintaining long-term financial stability'
    : result.classification === 'Viable with extreme care'
    ? 'with careful financial discipline required'
    : 'though this state presents significant financial challenges';
  
  const summaryText = `In ${result.state}, ${homeTimeline} and ${debtTimeline} ${stabilityNote} under current assumptions.`;
  
  doc.text(summaryText, margin + 8, yPos + 25, { maxWidth: contentWidth - 16, align: 'left' });
  
  yPos += 52;

  // ========================================================================
  // PHASE 1: SEPARATE INPUTS VS RESULTS
  // ========================================================================
  
  // Section A: Your Inputs
  checkNewPage(100);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Section A — Your Inputs (Assumed / Selected)', margin, yPos);
  yPos += 10;
  
  const stateForInputs = getStateByName(result.state);
  const costOfLiving = stateForInputs ? getHouseholdCost(stateForInputs, inputs.householdType, inputs.kids) : 
    (result.combinedIncome - result.disposableIncome);
  
  const inputsData = [
    ['Input', 'Value'],
    ['Combined Income', `$${result.combinedIncome.toLocaleString()}/year`],
    ['Cost of Living', `$${costOfLiving.toLocaleString()}/year`],
    ['% of Disposable Income Allocated', `${(inputs.allocationPercent * 100).toFixed(1)}%`],
    ['Target Home Size', inputs.homeSize.charAt(0).toUpperCase() + inputs.homeSize.slice(1)],
    ['Mortgage Rate', `${(result.mortgageRate * 100).toFixed(2)}%`],
    ['Savings Interest Rate', `${((inputs.savingsRate || 0) * 100).toFixed(2)}%`],
  ];
  
  autoTable(doc, {
    startY: yPos,
    head: [inputsData[0]],
    body: inputsData.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [100, 100, 100], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { left: margin, right: margin },
  });
  
  yPos = (doc.lastAutoTable?.finalY || yPos) + 18;
  
  // Section B: Your Results
  checkNewPage(80);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Section B — Your Results', margin, yPos);
  yPos += 10;
  
  // Calculate allocation percentages once (reused throughout PDF)
  const disposableIncome = result.disposableIncome;
  const combinedIncome = result.combinedIncome;
  const savingsPercentOfDisposable = result.savingsPercent;
  const debtPercentOfDisposable = result.minDebtPercent;
  const creditPercentOfDisposable = result.minCreditPercent || 0;
  
  const savingsPercentOfSalary = combinedIncome > 0 
    ? (disposableIncome * savingsPercentOfDisposable) / combinedIncome 
    : 0;
  const debtPercentOfSalary = combinedIncome > 0 
    ? (disposableIncome * debtPercentOfDisposable) / combinedIncome 
    : 0;
  const creditPercentOfSalary = combinedIncome > 0 
    ? (disposableIncome * creditPercentOfDisposable) / combinedIncome 
    : 0;
  
  // Calculate home size options once (used in multiple sections)
  const homeSizeOptions = calculateHomeSizeOptions(result, inputs);
  
  const resultsData = [
    ['Result', 'Value'],
    ['Viability Rating', `${(result.viabilityRating || 0).toFixed(1)}/10`],
    ['Years to Home Ownership', result.yearsToHome !== null ? `${result.yearsToHome.toFixed(1)} years` : 'N/A'],
    ['Years to Debt-Free', result.yearsToDebtFree !== null ? `${result.yearsToDebtFree.toFixed(1)} years` : 'N/A'],
    ['Home Savings Allocation', `${(savingsPercentOfDisposable * 100).toFixed(1)}% of disposable income`],
    ['Student Loan Allocation', `${(debtPercentOfDisposable * 100).toFixed(1)}% of disposable income`],
    ['Credit Card Allocation', `${(creditPercentOfDisposable * 100).toFixed(1)}% of disposable income`],
  ];
  
  autoTable(doc, {
    startY: yPos,
    head: [resultsData[0]],
    body: resultsData.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { left: margin, right: margin },
  });
  
  yPos = (doc.lastAutoTable?.finalY || yPos) + 18;

  // ========================================================================
  // PHASE 2: IMPROVED ALLOCATION TABLE WITH EXPLANATIONS
  // ========================================================================
  checkNewPage(100);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('3. Recommended Financial Allocation', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Optimal allocation strategy with explanatory notes below.', margin, yPos);
  yPos += 12;
  
  // Percentages and home size options already calculated above (in Section B)
  
  const allocationData = [
    [
      'Category',
      '% of Disposable Income',
      '% of Combined Salary',
      'Annual Amount'
    ],
    [
      'Home Savings',
      `${(savingsPercentOfDisposable * 100).toFixed(1)}%`,
      `${(savingsPercentOfSalary * 100).toFixed(1)}%`,
      `$${Math.round(disposableIncome * savingsPercentOfDisposable).toLocaleString()}`
    ],
    [
      'Student Loan Payment',
      `${(debtPercentOfDisposable * 100).toFixed(1)}%`,
      `${(debtPercentOfSalary * 100).toFixed(1)}%`,
      `$${Math.round(disposableIncome * debtPercentOfDisposable).toLocaleString()}`
    ],
    [
      'Credit Card Payment',
      creditPercentOfDisposable > 0 ? `${(creditPercentOfDisposable * 100).toFixed(1)}%` : '0%',
      creditPercentOfSalary > 0 ? `${(creditPercentOfSalary * 100).toFixed(1)}%` : '0%',
      creditPercentOfDisposable > 0 ? `$${Math.round(disposableIncome * creditPercentOfDisposable).toLocaleString()}` : '$0'
    ],
  ];
  
  autoTable(doc, {
    startY: yPos,
    head: [allocationData[0]],
    body: allocationData.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 45 },
      2: { cellWidth: 45 },
      3: { cellWidth: 45 },
    },
  });
  
  yPos = (doc.lastAutoTable?.finalY || yPos) + 12;
  
  // Add explanatory notes for each allocation category
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(80, 80, 80);
  
  if (savingsPercentOfDisposable > 0) {
    doc.text(`Home Savings (${(savingsPercentOfDisposable * 100).toFixed(1)}%): Used exclusively for down payment accumulation until purchase.`, margin + 4, yPos);
    yPos += 6;
  }
  
  if (debtPercentOfDisposable > 0) {
    doc.text(`Student Loans (${(debtPercentOfDisposable * 100).toFixed(1)}%): Above interest-only minimum to ensure principal reduction.`, margin + 4, yPos);
    yPos += 6;
  }
  
  if (creditPercentOfDisposable > 0) {
    doc.text(`Credit Cards (${(creditPercentOfDisposable * 100).toFixed(1)}%): Prevents balance growth and periodic refresh risk.`, margin + 4, yPos);
    yPos += 6;
  }
  
  yPos += 6;
  
  // HOME SIZE OPTIONS SECTION
  checkNewPage(80);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Home Size Options & Timelines', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Compare different home sizes and how long it will take to afford each one.', margin, yPos);
  yPos += 12;
  
  const homeSizeTableData = homeSizeOptions.map(opt => [
    opt.label,
    `$${opt.homeValue.toLocaleString()}`,
    opt.yearsToHome !== null ? `${opt.yearsToHome.toFixed(1)} years` : 'Not viable',
    opt.viable ? '✓ Viable' : '✗ Not viable'
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Home Size', 'Home Value', 'Years to Purchase', 'Viability']],
    body: homeSizeTableData,
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { left: margin, right: margin },
    columnStyles: {
      3: { cellWidth: 35 },
    },
  });
  
  yPos = (doc.lastAutoTable?.finalY || yPos) + 12;
  
  // Add insight after home size table
  const viableSizesForInsight = homeSizeOptions.filter(opt => opt.viable && opt.yearsToHome !== null);
  if (viableSizesForInsight.length > 0) {
    const fastestSize = viableSizesForInsight.reduce((best, current) => {
      if (!best || !current.yearsToHome) return current;
      if (!best.yearsToHome) return current;
      return current.yearsToHome < best.yearsToHome ? current : best;
    }, null as HomeSizeOption | null);
    
    const selectedOption = homeSizeOptions.find(o => o.size === inputs.homeSize);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    
    let insightText = '';
    if (fastestSize && fastestSize.size === inputs.homeSize) {
      insightText = `Insight: Your selected ${fastestSize.label.toLowerCase()} home size is optimal, balancing speed (${fastestSize.yearsToHome?.toFixed(1)} years) with your preferences while maintaining financial flexibility.`;
    } else if (fastestSize && selectedOption && selectedOption.yearsToHome && fastestSize.yearsToHome) {
      const timeDiff = selectedOption.yearsToHome - fastestSize.yearsToHome;
      insightText = `Insight: ${fastestSize.label} homes can be purchased ${timeDiff.toFixed(1)} years faster, trading size for speed and reduced financial risk. Your selected size prioritizes space over timeline.`;
    } else if (fastestSize) {
      insightText = `Insight: ${fastestSize.label} homes offer the fastest timeline (${fastestSize.yearsToHome?.toFixed(1)} years), prioritizing speed and reduced financial risk.`;
    }
    
    if (insightText) {
      doc.text(insightText, margin + 4, yPos, { maxWidth: contentWidth - 8 });
      yPos += 12;
    }
  }
  
  // Year-by-Year Breakdown
  checkNewPage(100);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('5. Year-by-Year Financial Allocation', margin, yPos);
  yPos += 10;
  
  const yearlyBreakdown = generateYearlyBreakdown(result, inputs, 15);
  const milestoneYears = new Set<number>();
  if (result.yearsToDebtFree !== null) milestoneYears.add(Math.ceil(result.yearsToDebtFree));
  if (result.yearsToHome !== null) milestoneYears.add(Math.ceil(result.yearsToHome));
  
  const tableData: any[] = [];
  // Add first 5 years
  for (let i = 0; i < Math.min(5, yearlyBreakdown.length); i++) {
    const year = yearlyBreakdown[i];
    tableData.push([
      `Year ${year.year} (Age ${year.age})`,
      `$${year.debtPayment.toFixed(0)}`,
      `$${year.savingsForHome.toFixed(0)}`,
      `$${year.totalAllocated.toFixed(0)}`,
      `$${year.homeSavings.toFixed(0)}`,
      `$${year.netWorth.toFixed(0)}`,
    ]);
  }
  
  // Add milestone years if not in first 5
  milestoneYears.forEach(yr => {
    if (yr > 5 && yr <= yearlyBreakdown.length) {
      const year = yearlyBreakdown[yr - 1];
      tableData.push([
        `Year ${year.year} (Age ${year.age}) ⭐`,
        `$${year.debtPayment.toFixed(0)}`,
        `$${year.savingsForHome.toFixed(0)}`,
        `$${year.totalAllocated.toFixed(0)}`,
        `$${year.homeSavings.toFixed(0)}`,
        `$${year.netWorth.toFixed(0)}`,
      ]);
    }
  });
  
  if (tableData.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Year', 'Debt Payment', 'Home Savings', 'Total Allocated', 'Total Saved', 'Net Worth']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 28 },
        2: { cellWidth: 28 },
        3: { cellWidth: 28 },
        4: { cellWidth: 28 },
        5: { cellWidth: 28 },
      },
    });
    
    yPos = (doc.lastAutoTable?.finalY || yPos) + 18;
    
    // Add net worth explanation footnote
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(80, 80, 80);
    doc.text('Net Worth = Savings + Home Equity − Remaining Debt', margin + 4, yPos);
    yPos += 6;
    doc.text('Early negative net worth is expected due to high initial student loan balances.', margin + 4, yPos);
    yPos += 12;
  }
  checkNewPage(100);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('7. Ways to Improve Wealth Generation', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Actionable strategies to accelerate your path to financial freedom.', margin, yPos);
  yPos += 12;
  
  const improvements: string[] = [];
  
  // Generate improvement suggestions with concrete outcomes
  if (result.savingsPercent < 0.2 && result.savingsPercent > 0) {
    const currentPercent = (result.savingsPercent * 100).toFixed(1);
    const newPercent = 20;
    if (result.yearsToHome !== null && result.yearsToHome > 0) {
      // Estimate: 5% increase in savings rate roughly translates to 15-20% faster timeline
      const monthsSaved = Math.round((result.yearsToHome * 12) * 0.15);
      improvements.push(`Increasing savings allocation from ${currentPercent}% to ${newPercent}% would reduce home purchase timeline by approximately ${monthsSaved} months (from ${result.yearsToHome.toFixed(1)} to ${Math.max(1, result.yearsToHome - (monthsSaved / 12)).toFixed(1)} years).`);
    }
  }
  
  if (result.yearsToDebtFree && result.yearsToDebtFree > 5) {
    const extraPercent = Math.min(10, (result.requiredAllocationPercent || 0) * 100 + 5 - (inputs.allocationPercent * 100));
    if (extraPercent > 0) {
      const monthsReduced = Math.round((result.yearsToDebtFree - 5) * 12 * 0.3); // Rough estimate
      improvements.push(`Increasing debt payment allocation by ${extraPercent.toFixed(0)}% would reduce debt-free timeline from ${result.yearsToDebtFree.toFixed(1)} years to approximately ${Math.max(3, result.yearsToDebtFree - (monthsReduced / 12)).toFixed(1)} years (${monthsReduced} months faster).`);
    }
  }
  
  if (inputs.savingsRate < 0.03 && inputs.savingsRate >= 0) {
    const currentRate = (inputs.savingsRate * 100).toFixed(1);
    const monthsSaved = result.yearsToHome !== null && result.yearsToHome > 0 ? Math.round(result.yearsToHome * 12 * 0.08) : 0;
    if (monthsSaved > 0) {
      improvements.push(`Maximizing savings rate from ${currentRate}% to 3-5% (high-yield accounts) would reduce home purchase timeline by approximately ${monthsSaved} months through compound growth.`);
    }
  }
  
  if (result.homeValue > 0 && result.yearsToHome && result.yearsToHome > 10) {
    const smallerSizes = homeSizeOptions.filter(opt => opt.viable && opt.yearsToHome && opt.yearsToHome < result.yearsToHome!);
    if (smallerSizes.length > 0) {
      const fastestSmall = smallerSizes.reduce((best, curr) => (curr.yearsToHome || Infinity) < (best.yearsToHome || Infinity) ? curr : best);
      if (fastestSmall.yearsToHome) {
        const yearsSaved = result.yearsToHome! - fastestSmall.yearsToHome;
        improvements.push(`Choosing a ${fastestSmall.label.toLowerCase()} home instead of ${inputs.homeSize} would reduce purchase timeline from ${result.yearsToHome.toFixed(1)} to ${fastestSmall.yearsToHome.toFixed(1)} years (${yearsSaved.toFixed(1)} years faster).`);
      }
    }
  }
  
  if (inputs.allocationPercent < 0.3 && inputs.allocationPercent > 0) {
    const newAlloc = Math.min(1, inputs.allocationPercent + 0.1);
    const percentIncrease = ((newAlloc - inputs.allocationPercent) * 100).toFixed(0);
    if (result.yearsToHome !== null && result.yearsToHome > 0) {
      const monthsSaved = Math.round(result.yearsToHome * 12 * 0.25); // Rough estimate
      improvements.push(`Increasing overall allocation from ${(inputs.allocationPercent * 100).toFixed(0)}% to ${(newAlloc * 100).toFixed(0)}% (+${percentIncrease}%) would reduce home purchase timeline by approximately ${monthsSaved} months.`);
    }
  }
  
  if (result.classification === 'Viable with a higher % allocated') {
    const optimalAlloc = Math.min(100, Math.ceil((result.requiredAllocationPercent || 0) * 100 / 5) * 5);
    improvements.push(`Raising allocation to ${optimalAlloc}% (from ${(inputs.allocationPercent * 100).toFixed(0)}%) would make this state fully viable, enabling home ownership where it's currently not achievable.`);
  }
  
  // Display improvements (only if meaningful)
  if (improvements.length === 0) {
    improvements.push('No material improvements recommended under current assumptions. Your financial strategy appears optimized for your goals.');
  }
  
  improvements.slice(0, 6).forEach((improvement, idx) => {
    if (yPos > pageHeight - 25) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`${idx + 1}. ${improvement}`, margin + 4, yPos);
    yPos += 7;
  });
  
  yPos += 5;
  
  // Recommendations from app
  if (recommendations.length > 0) {
    checkNewPage(60);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Additional Recommendations', margin, yPos);
    yPos += 10;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    recommendations.slice(0, 6).forEach((rec, idx) => {
      if (yPos > pageHeight - 20) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(`${idx + 1}. ${rec.text}`, margin + 4, yPos);
      yPos += 7;
    });
  }
  
  // Notes if any
  if (result.notes.length > 0) {
    checkNewPage(40);
    yPos += 5;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Important Notes', margin, yPos);
    yPos += 10;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 0, 0);
    result.notes.forEach((note) => {
      if (yPos > pageHeight - 20) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(`• ${note}`, margin + 4, yPos);
      yPos += 6;
    });
  }
  
  // PORTFOLIO FIT ANALYSIS SECTION (renamed to "Why This State Works")
  checkNewPage(100);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('6. Why This State Works', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Cause-and-effect analysis of how state economic factors impact your financial plan.', margin, yPos);
  yPos += 12;
  
  const portfolioFitBullets: string[] = [];
  
  // Reframe as cause-effect statements
  // Cost of living cause-effect (reuse state from inputs section)
  const stateData = getStateByName(result.state);
  const avgHouseholdCost = stateData ? getHouseholdCost(stateData, inputs.householdType, inputs.kids) : 0;
  const costRatio = result.combinedIncome > 0 ? (avgHouseholdCost / result.combinedIncome) * 100 : 0;
  const costDescription = costRatio <= 70 ? 'Low' : costRatio <= 80 ? 'Moderate' : 'High';
  portfolioFitBullets.push(`${costDescription} cost of living keeps expenses at ${costRatio.toFixed(1)}% of income, ${costRatio <= 70 ? 'allowing aggressive savings and debt payoff' : costRatio <= 80 ? 'requiring disciplined budgeting' : 'limiting available funds for savings and debt reduction'}`);
  
  // Home price cause-effect
  const homePriceToIncomeRatio = result.combinedIncome > 0 ? (result.homeValue / result.combinedIncome) : 0;
  const homeAffordabilityDesc = homePriceToIncomeRatio <= 3 ? 'Affordable' : homePriceToIncomeRatio <= 5 ? 'Moderate' : 'High';
  portfolioFitBullets.push(`${homeAffordabilityDesc} home prices (${homePriceToIncomeRatio.toFixed(1)}x annual income) ${homePriceToIncomeRatio <= 3 ? 'create favorable conditions for rapid down payment accumulation' : homePriceToIncomeRatio <= 5 ? 'require extended savings periods but remain achievable' : 'significantly extend the timeline to home ownership'}`);
  
  // Debt payoff speed cause-effect
  if (result.yearsToDebtFree !== null) {
    const debtSpeedDesc = result.yearsToDebtFree <= 5 ? 'Fast' : result.yearsToDebtFree <= 10 ? 'Moderate' : 'Extended';
    portfolioFitBullets.push(`${debtSpeedDesc} debt payoff (${result.yearsToDebtFree.toFixed(1)} years) ${result.yearsToDebtFree <= 5 ? 'frees up income early, accelerating home purchase timeline' : result.yearsToDebtFree <= 10 ? 'allows simultaneous progress toward both goals' : 'creates a sequential strategy requiring debt elimination before home savings'}`);
  }
  
  portfolioFitBullets.forEach((bullet) => {
    if (yPos > pageHeight - 20) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`• ${bullet}`, margin + 4, yPos, { maxWidth: contentWidth - 8 });
    yPos += 7;
  });
  
  yPos += 8;
  
  // ========================================================================
  // PHASE 5: TRADE-OFFS TO CONSIDER SECTION
  // ========================================================================
  checkNewPage(80);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('8. Trade-offs to Consider', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Realistic considerations and potential downsides of choosing this state.', margin, yPos);
  yPos += 12;
  
  const tradeOffs: string[] = [];
  
  // Income growth ceiling
  if (result.viabilityRating < 8) {
    tradeOffs.push(`Income growth ceiling: ${result.state}'s economic conditions may limit long-term salary growth potential compared to major metropolitan areas, affecting future financial flexibility.`);
  }
  
  // Job market concentration
  if (result.yearsToHome !== null && result.yearsToHome > 8) {
    tradeOffs.push(`Job market concentration: Limited job mobility in ${result.state} may reduce career advancement opportunities and income growth potential, extending home ownership timelines if income remains flat.`);
  }
  
  // Opportunity cost
  if (result.viabilityRating >= 8 && result.yearsToHome !== null && result.yearsToHome > 5) {
    tradeOffs.push(`Long-term opportunity cost: Choosing ${result.state} over higher-cost states with faster career growth may limit lifetime earning potential, though it accelerates home ownership and financial stability.`);
  } else if (result.yearsToHome !== null && result.yearsToHome > 10) {
    tradeOffs.push(`Opportunity cost: Extended timeline to home ownership (${result.yearsToHome.toFixed(1)} years) means delayed equity building and potential wealth accumulation compared to states with faster timelines.`);
  }
  
  // Market risk
  if (result.homeValue > result.combinedIncome * 5) {
    tradeOffs.push(`Housing market risk: High home price-to-income ratio (${(result.homeValue / result.combinedIncome).toFixed(1)}x) increases sensitivity to market corrections, potentially impacting home equity and refinancing options.`);
  }
  
  // Limited buffer
  if (result.requiredAllocationPercent && inputs.allocationPercent <= result.requiredAllocationPercent * 1.1) {
    tradeOffs.push(`Limited financial buffer: Allocation percentage (${(inputs.allocationPercent * 100).toFixed(0)}%) is close to minimum required (${(result.requiredAllocationPercent * 100).toFixed(0)}%), leaving little room for unexpected expenses or income disruptions.`);
  }
  
  // Display trade-offs (always show at least 2-3)
  if (tradeOffs.length === 0) {
    tradeOffs.push(`Market variability: Housing market fluctuations could impact home values and refinancing opportunities, affecting long-term wealth building strategy.`);
    tradeOffs.push(`Life changes: Unplanned events (job loss, family changes, major expenses) could disrupt the financial timeline, requiring strategy adjustments.`);
  }
  
  tradeOffs.slice(0, 3).forEach((tradeOff, idx) => {
    if (yPos > pageHeight - 25) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`• ${tradeOff}`, margin + 4, yPos, { maxWidth: contentWidth - 8 });
    yPos += 7;
  });
  
  yPos += 8;
  
  // METHODOLOGY / CONCLUSION RATIONALE SECTION
  checkNewPage(100);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('9. Methodology & Assumptions', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Methodology and key assumptions used in the financial simulation and analysis.', margin, yPos);
  yPos += 12;
  
  const methodologyBullets: string[] = [];
  
  methodologyBullets.push(`Simulation Model: Year-by-year financial simulation over up to ${result.yearsToHome && result.yearsToHome > 0 ? Math.ceil(result.yearsToHome) + 5 : 30} years, accounting for inflation (2.5% annually), income growth (2% annually), and home price appreciation (3% annually)`);
  
  methodologyBullets.push(`Income Projection: Base income from ${inputs.incomeSource === 'occupation' ? `occupation data for ${result.state}` : 'manual salary entry'} with ${inputs.householdType === 'marriedTwoIncome' ? 'partner income included' : 'single income'}, projected with annual growth`);
  
  methodologyBullets.push(`Cost of Living Calculation: Dynamic household costs based on ${inputs.householdType.replace(/([A-Z])/g, ' $1').trim().toLowerCase()} household with ${inputs.kids} ${inputs.kids === 1 ? 'child' : 'children'}, adjusted for inflation and future family changes`);
  
  methodologyBullets.push(`Debt Management: Student loan ($${(inputs.studentLoanBalance || 0).toLocaleString()} at ${((inputs.studentLoanRate || 0) * 100).toFixed(1)}%) and credit card debt ($${(inputs.creditCardBalance || 0).toLocaleString()} at ${((inputs.creditCardApr || 0) * 100).toFixed(1)}%) tracked with compound interest and minimum payment requirements`);
  
  methodologyBullets.push(`Savings Strategy: ${(inputs.allocationPercent * 100).toFixed(0)}% of disposable income allocated, with ${(inputs.savingsRate * 100).toFixed(1)}% annual savings rate growth, prioritized toward home down payment then debt payoff`);
  
  if (result.yearsToHome !== null) {
    methodologyBullets.push(`Home Purchase Timing: Down payment target reached after ${result.yearsToHome.toFixed(1)} years through systematic savings, with sustainability check confirming mortgage affordability under projected future costs`);
  } else {
    methodologyBullets.push(`Home Purchase Barrier: Insufficient savings rate or allocation to reach down payment target within reasonable timeline under current parameters`);
  }
  
  if (result.yearsToDebtFree !== null) {
    methodologyBullets.push(`Debt Payoff Calculation: Debt eliminated after ${result.yearsToDebtFree.toFixed(1)} years using optimal allocation strategy (minimum payments to prevent growth, then accelerated payoff after home purchase)`);
  } else {
    methodologyBullets.push(`Debt Payoff Constraint: Minimum payments insufficient to overcome interest accumulation, requiring higher allocation percentage or alternative debt management strategy`);
  }
  
  methodologyBullets.push(`Classification Logic: Viability score calculated from timeline speed (home purchase and debt freedom), allocation buffer, and disposable income margin, mapped to ${result.classification}`);
  
  methodologyBullets.push(`Sustainability Validation: Plan verified for 5 years post-purchase to ensure mortgage remains affordable with projected cost of living increases and family changes`);
  
  methodologyBullets.forEach((bullet) => {
    if (yPos > pageHeight - 20) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`• ${bullet}`, margin + 4, yPos, { maxWidth: contentWidth - 8 });
    yPos += 7;
  });
  
  // Footer
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${totalPages} - Generated by Affordability Planner`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }
  
  // Download PDF
  doc.save(`${result.state.replace(/\s+/g, '_')}_Financial_Plan.pdf`);
}
