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
  
  // ALLOCATION PERCENTAGES SECTION
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Recommended Financial Allocation', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Your recommended allocation percentages for savings, debt payments, and expenses.', margin, yPos);
  yPos += 12;
  
  // Calculate percentages
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
  
  yPos = (doc.lastAutoTable?.finalY || yPos) + 18;
  
  // Key Metrics Section
  checkNewPage(50);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Key Financial Metrics', margin, yPos);
  yPos += 10;
  
  const metrics = [
    ['Viability Rating', `${(result.viabilityRating || 0).toFixed(1)}/10`],
    ['Classification', result.classification],
    ['Combined Income', `$${result.combinedIncome.toLocaleString()}/year`],
    ['Disposable Income', `$${result.disposableIncome.toLocaleString()}/year`],
    ['Allocation Percentage', `${(inputs.allocationPercent * 100).toFixed(1)}%`],
    ['Years to Debt-Free', result.yearsToDebtFree !== null ? `${result.yearsToDebtFree.toFixed(1)} years` : 'N/A'],
    ['Years to Home Ownership', result.yearsToHome !== null ? `${result.yearsToHome.toFixed(1)} years` : 'N/A'],
    ['Current Home Target', `$${result.homeValue.toLocaleString()}`],
    ['Down Payment %', `${(result.downPaymentPercent * 100).toFixed(1)}%`],
    ['Mortgage Rate', `${(result.mortgageRate * 100).toFixed(2)}%`],
  ];
  
  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value']],
    body: metrics,
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { left: margin, right: margin },
  });
  
  yPos = (doc.lastAutoTable?.finalY || yPos) + 18;
  
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
  
  const homeSizeOptions = calculateHomeSizeOptions(result, inputs);
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
  
  yPos = (doc.lastAutoTable?.finalY || yPos) + 18;
  
  // Year-by-Year Breakdown
  checkNewPage(100);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Year-by-Year Financial Allocation', margin, yPos);
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
  }
  
  // WEALTH GENERATION IMPROVEMENTS SECTION
  checkNewPage(100);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Ways to Improve Wealth Generation', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Actionable strategies to accelerate your path to financial freedom.', margin, yPos);
  yPos += 12;
  
  const improvements: string[] = [];
  
  // Generate improvement suggestions based on current situation
  if (result.savingsPercent < 0.2) {
    improvements.push(`Increase savings allocation: Currently at ${(result.savingsPercent * 100).toFixed(1)}%. Increasing to 20%+ would significantly accelerate home ownership.`);
  }
  
  if (result.yearsToDebtFree && result.yearsToDebtFree > 5) {
    improvements.push(`Accelerate debt payoff: Paying an extra 5-10% toward student loans could reduce debt-free timeline from ${result.yearsToDebtFree.toFixed(1)} years to ${Math.max(3, result.yearsToDebtFree - 2).toFixed(1)} years.`);
  }
  
  if (inputs.savingsRate < 0.03) {
    improvements.push(`Maximize savings rate: Current rate of ${(inputs.savingsRate * 100).toFixed(1)}%. Consider high-yield savings accounts or conservative investments for 3-5% returns.`);
  }
  
  if (result.homeValue > 0 && result.yearsToHome && result.yearsToHome > 10) {
    improvements.push(`Consider smaller home initially: A small or medium home could be purchased ${Math.max(2, result.yearsToHome - 8).toFixed(0)} years sooner, then upgrade later.`);
  }
  
  if (inputs.allocationPercent < 0.3) {
    improvements.push(`Increase overall allocation: Allocating ${((inputs.allocationPercent + 0.1) * 100).toFixed(0)}% instead of ${(inputs.allocationPercent * 100).toFixed(0)}% of disposable income could shorten timelines by 20-30%.`);
  }
  
  if (result.classification === 'Viable with a higher % allocated') {
    improvements.push(`Raise allocation percentage: With a higher allocation, this state becomes fully viable with faster timelines.`);
  }
  
  // Add general suggestions
  improvements.push(`Automate savings: Set up automatic transfers to ensure consistent savings each month.`);
  improvements.push(`Track expenses: Monitor spending to identify areas where you can redirect funds to savings or debt payoff.`);
  
  if (inputs.householdType === 'single' && inputs.advanced?.partnerTiming === 'yes') {
    improvements.push(`Partner income boost: When your partner joins the household, your combined income will significantly improve your timelines.`);
  }
  
  // Display improvements
  improvements.slice(0, 8).forEach((improvement, idx) => {
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
