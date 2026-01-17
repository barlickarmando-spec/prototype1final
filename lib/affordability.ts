import stateDataRaw from "../data/state_data.json";
import dictRaw from "../data/data_dictionary.json";

export type HouseholdType = "single" | "marriedOneIncome" | "marriedTwoIncome";
export type Strategy = "conservative" | "balanced" | "aggressive";
export type StrategyMode = Strategy | "auto";
export type LocationCertainty = "sure" | "deciding" | "unknown";

export type AcademicStatus = 
  | "graduated_independent"
  | "student_independent"
  | "student_soon_independent"
  | "no_college_debt"
  | "more_options";

export type UserInputs = {
  age: number;
  academicStatus?: AcademicStatus;
  financialAssistance?: boolean;
  financialAssistanceDuration?: number; // in years
  personalizationPrompt?: string;
  locationCertainty: LocationCertainty;
  selectedStates: string[]; // abbreviations only
  householdType: HouseholdType;
  kids: number;
  incomeSource: "occupation" | "salary";
  occupation: string;
  partnerOccupation?: string;
  salaryOverride?: number;
  partnerIncomeSource?: "occupation" | "salary";
  partnerSalaryOverride?: number;
  studentLoanBalance: number;
  studentLoanRate: number;
  creditCardBalance: number;
  creditCardApr: number;
  savingsRate: number;
  allocationPercent: number;
  homeSize: "small" | "medium" | "large" | "veryLarge";
  strategyMode: StrategyMode;
  advanced: {
    futureKids: boolean;
    firstChildAge?: number;
    secondChildAge?: number;
    partnerTiming?: "yes" | "no" | "already";
    partnerAge?: number;
    annualCreditCardDebt?: number;
    studentLoanStyle?: "standard" | "accelerated" | "unsure";
  };
};

export type StateResult = {
  state: string;
  stateAbbr: string;
  classification:
    | "No viable path"
    | "Viable only when renting"
    | "Viable with extreme care"
    | "Viable with a higher % allocated"
    | "Viable"
    | "Very viable and stable";
  viabilityRating: number; // 0-10 rating
  disposableIncome: number;
  combinedIncome: number;
  minDebtPercent: number;
  minCreditPercent: number;
  savingsPercent: number;
  yearsToHome: number | null;
  yearsToDebtFree: number | null;
  homeValue: number;
  mortgageRate: number;
  downPaymentPercent: number;
  strategy: Strategy;
  creditCardPlan: "upfront-only" | "reserve";
  notes: string[];
  // New fields from simulation
  monthlyMortgagePayment?: number;
  requiredAllocationPercent?: number;
  recommendedAllocationPercent?: number;
};

export type SelectOption = { value: string; label: string };

/**
 * IMPORTANT:
 * - state_data.json is keyed by state name (object, not array)
 * - All reads must be defensive; never assume keys exist.
 */
type HomeSize = UserInputs["homeSize"];

// State name → abbreviation mapping (internal mapping, not in JSON)
const STATE_NAME_TO_ABBR: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

export type StateData = {
  name?: string;
  abbr?: string;
  // Raw state data from JSON (flat structure)
  // occupations are flat keys (e.g. "management", "business_and_operations")
  // cost of living is flat keys (e.g. "annual_minimum_living_wage_family_of_3_2_workers")
  // home values are flat keys (e.g. "typical_home_value_small")
  [key: string]: unknown;
};

// ============================================================================
// MODEL ASSUMPTIONS (explicit and easy to edit)
// ============================================================================

const MODEL_ASSUMPTIONS = {
  inflationRate: 0.025, // 2.5% annual inflation
  incomeGrowthRate: 0.02, // 2% annual income growth (optional but recommended)
  homePriceGrowthRate: 0.03, // 3% annual home price growth (slightly above inflation)
  closingCostRate: 0.02, // 2% closing costs buffer on top of down payment
  mortgageTermYears: 30, // 30-year fixed mortgage
  maxYears: 80, // Maximum years to simulate
  loanProgressBufferPercent: 0.03, // 3% of disposable income buffer so loans actually decline
  ccRefreshPeriodYears: 5, // Credit card debt refreshes every 5 years
  defaultAnnualCreditCardDebt: 0, // Default to 0 if user doesn't provide
  requireDebtNotToGrow: true, // Constraint: debt must not grow
} as const;

// ============================================================================
// DATA NORMALIZATION
// ============================================================================

const normalizeStates = (): StateData[] => {
  const raw = stateDataRaw as unknown;
  
  // Handle object keyed by state name (actual structure)
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>);
    return entries
      .filter(([key, value]) => {
        // Skip "National Average:" or other non-state keys
        if (!value || typeof value !== "object") return false;
        return typeof key === "string" && key !== "National Average:";
      })
      .map(([stateName, stateObj]) => {
        const abbr = STATE_NAME_TO_ABBR[stateName] || "";
        return {
          name: stateName,
          abbr,
          ...(stateObj as Record<string, unknown>),
        } as StateData;
      });
  }
  
  // Legacy: handle array format (for backward compatibility)
  if (Array.isArray(raw)) {
    return raw
      .filter((s): s is StateData => !!s && typeof s === "object")
      .map((s) => {
        const name = typeof s.name === "string" ? s.name : "";
        const abbr = typeof s.abbr === "string" ? s.abbr : (name ? STATE_NAME_TO_ABBR[name] || "" : "");
        return { ...s, name, abbr } as StateData;
      });
  }
  
  return [];
};

const getAllStates = (): StateData[] => normalizeStates();

const safeNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const clampKids = (kids: number): "0" | "1" | "2" => {
  if (kids <= 0) return "0";
  if (kids === 1) return "1";
  return "2";
};

// ============================================================================
// EXPORTED API FUNCTIONS (must maintain contracts)
// ============================================================================

export const getStates = (): SelectOption[] => {
  const states = getAllStates();
  return states
    .map((state) => {
      const abbr = typeof state.abbr === "string" ? state.abbr : "";
      const name = typeof state.name === "string" ? state.name : "";
      if (!abbr || !name) return null;
      return { value: abbr, label: name };
    })
    .filter((x): x is SelectOption => x !== null);
};

export const getDataDictionary = () => dictRaw;

export const getOccupations = (): SelectOption[] => {
  const states = getAllStates();
  const occupations = new Set<string>();

  // Known occupation keys from data dictionary
  const knownOccupations = [
    "management",
    "business_and_operations",
    "computer_and_mathematics",
    "architecture_and_engineering",
    "life_physical_and_social_science",
    "community_service",
    "legal_work",
    "education_training_library",
    "arts_design_entertainment_sports_media",
    "healthcare_practioners_and_technical_work",
    "healthcare_support",
    "protective_service",
    "food_preparation_and_serving",
    "cleaning_and_maintenance",
    "personal_care_and_service",
    "sales_and_related",
    "office_and_administrative_support",
    "farming_fishing_and_forestry",
    "construction_and_extraction",
    "insallation_maintenance_and_repair",
    "production",
    "transportation_and_material_moving",
  ];

  // Collect all occupation keys that exist in states and are in known list
  states.forEach((state) => {
    const stateData = state as Record<string, unknown>;
    knownOccupations.forEach((occKey) => {
      if (occKey in stateData && typeof stateData[occKey] === "number") {
        occupations.add(occKey);
      }
    });
  });

  // Use data dictionary for labels when available
  const dict = dictRaw as Record<string, string>;
  return Array.from(occupations)
    .sort()
    .map((occupation) => ({
      value: occupation,
      label: dict[occupation] || occupation.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    }));
};

export const getStateByName = (name: string) => {
  const states = getAllStates();
  return states.find((state) => state.name === name || state.abbr === name);
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Map household type + kids to flat JSON key
const getHouseholdCostKey = (householdType: HouseholdType, kids: number): string => {
  const kidsKey = clampKids(kids);
  
  if (householdType === "single") {
    if (kids === 0) return "annual_minimum_living_wage_1_person";
    if (kids === 1) return "annual_minimum_living_wage_single_parent_1_kid";
    if (kids === 2) return "annual_minimum_living_wage_single_parent_2_kids";
    return "annual_minimum_living_wage_single_parent_3_kids"; // kids >= 3
  }
  
  if (householdType === "marriedOneIncome") {
    if (kids === 0) return "annual_minimum_living_wage_1_worker_1_adult";
    if (kids === 1) return "annual_minimum_living_wage_family_of_3_1_worker";
    if (kids === 2) return "annual_minimum_living_wage_family_of_4_1_worker";
    return "annual_minimum_living_wage_family_of_5_1_worker"; // kids >= 3
  }
  
  // marriedTwoIncome
  if (kids === 0) return "annual_minimum_living_wage_2_workers";
  if (kids === 1) return "annual_minimum_living_wage_family_of_3_2_workers";
  if (kids === 2) return "annual_minimum_living_wage_family_of_4_2_workers";
  return "annual_minimum_living_wage_family_of_5_2_workers"; // kids >= 3
};

export const getHouseholdCost = (
  state: StateData,
  householdType: HouseholdType,
  kids: number,
) => {
  const key = getHouseholdCostKey(householdType, kids);
  const stateData = state as Record<string, unknown>;
  return safeNumber(stateData[key]);
};

const getSalary = (state: StateData, occupation: string, override?: number) => {
  if (typeof override === "number" && override > 0) return override;
  // Occupations are flat keys at the state level
  const stateData = state as Record<string, unknown>;
  const raw = stateData[occupation];
  return safeNumber(raw);
};

// Compound growth: value * (1 + rate)^years
const compound = (value: number, rate: number, years: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(rate) || !Number.isFinite(years)) return value;
  if (years <= 0) return value;
  return value * Math.pow(1 + rate, years);
};

// Calculate monthly mortgage payment using PMT formula
// PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
// Where P = principal, r = monthly rate, n = number of payments
const calcMortgageMonthlyPayment = (
  homeValue: number,
  downPaymentPercent: number,
  mortgageRate: number,
  termYears: number = MODEL_ASSUMPTIONS.mortgageTermYears
): number => {
  if (homeValue <= 0 || mortgageRate <= 0 || termYears <= 0) return 0;
  
  const downPayment = homeValue * downPaymentPercent;
  const principal = homeValue - downPayment;
  if (principal <= 0) return 0;
  
  const monthlyRate = mortgageRate / 12;
  const numPayments = termYears * 12;
  
  if (monthlyRate === 0) {
    // No interest case
    return principal / numPayments;
  }
  
  const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
    (Math.pow(1 + monthlyRate, numPayments) - 1);
  
  return Number.isFinite(monthlyPayment) ? monthlyPayment : 0;
};

// Calculate annual mortgage payment
const calcMortgageAnnualPayment = (
  homeValue: number,
  downPaymentPercent: number,
  mortgageRate: number,
  termYears: number = MODEL_ASSUMPTIONS.mortgageTermYears
): number => {
  return calcMortgageMonthlyPayment(homeValue, downPaymentPercent, mortgageRate, termYears) * 12;
};

// Get kids count at a specific year based on future kids schedule
const getKidsCountAtYear = (inputs: UserInputs, yearIndex: number): number => {
  const currentAge = inputs.age || 0;
  const currentKids = inputs.kids || 0;
  
  // If futureKids is false, kids stay constant
  if (!inputs.advanced?.futureKids) {
    return currentKids;
  }
  
  let kids = currentKids;
  const ageAtYear = currentAge + yearIndex;
  
  // Check if first child age is reached
  if (inputs.advanced.firstChildAge !== undefined) {
    const firstChildAge = inputs.advanced.firstChildAge;
    // If we've crossed the first child age threshold
    if (ageAtYear >= firstChildAge && currentAge < firstChildAge) {
      kids = Math.max(kids, 1);
    } else if (ageAtYear >= firstChildAge) {
      kids = Math.max(kids, 1);
    }
  }
  
  // Check if second child age is reached
  if (inputs.advanced.secondChildAge !== undefined) {
    const secondChildAge = inputs.advanced.secondChildAge;
    // If we've crossed the second child age threshold
    if (ageAtYear >= secondChildAge && (inputs.advanced.firstChildAge === undefined || ageAtYear > (inputs.advanced.firstChildAge || 0))) {
      kids = Math.max(kids, 2);
    } else if (ageAtYear >= secondChildAge) {
      kids = Math.max(kids, 2);
    }
  }
  
  return kids;
};

// ============================================================================
// SIMULATION LOGIC
// ============================================================================

type SimulationResult = {
  yearsToHome: number | null;
  yearsToDebtFree: number | null;
  monthlyMortgagePayment: number;
  requiredAllocationPercent: number;
  recommendedAllocationPercent: number;
  notes: string[];
  creditCardPlan: "upfront-only" | "reserve";
};

const simulateState = (inputs: UserInputs, state: StateData): SimulationResult => {
  const notes: string[] = [];
  
  // Get initial values from state data
  const stateName = typeof state.name === "string" ? state.name : "";
  const stateAbbr = typeof state.abbr === "string" ? state.abbr : "";
  
  // Get income
  const primaryIncome = inputs.incomeSource === "occupation" 
    ? getSalary(state, inputs.occupation, inputs.salaryOverride)
    : (inputs.salaryOverride || 0);
  
  const partnerIncome = inputs.householdType === "marriedTwoIncome"
    ? (inputs.partnerIncomeSource === "occupation"
      ? getSalary(state, inputs.partnerOccupation || "", inputs.partnerSalaryOverride)
      : (inputs.partnerSalaryOverride || 0))
    : 0;
  
  const baseIncome = primaryIncome + partnerIncome;
  
  if (baseIncome <= 0 && inputs.incomeSource === "occupation") {
    notes.push("Missing occupation data for this state.");
  }
  
  // Get home value and mortgage info
  const homeSizeKeyMap: Record<HomeSize, string> = {
    small: "typical_home_value_small",
    medium: "typical_home_value_single_family_normal",
    large: "typical_home_value_large",
    veryLarge: "typical_home_value_very_large",
  };
  const homeValueKey = homeSizeKeyMap[inputs.homeSize] || "typical_home_value_single_family_normal";
  const stateData = state as Record<string, unknown>;
  const baseHomeValue = safeNumber(stateData[homeValueKey]);
  const mortgageRate = safeNumber(stateData["average_mortgage_rate_fixed_30_year"]);
  const downPaymentPercent = safeNumber(stateData["median_mortgage_down_payment_percent"]);
  
  // Initialize simulation state
  let savingsBalance = 0;
  let loanBalance = Math.max(0, inputs.studentLoanBalance || 0);
  let ccBalance = Math.max(0, inputs.creditCardBalance || 0);
  
  let homePurchased = false;
  let homePurchaseYear: number | null = null;
  let yearsToHome: number | null = null;
  let yearsToDebtFree: number | null = null;
  
  let maxRequiredAllocationPercent = 0;
  
  // Credit card refresh amount
  const ccRefreshAmount = (inputs.advanced?.annualCreditCardDebt ?? MODEL_ASSUMPTIONS.defaultAnnualCreditCardDebt) * MODEL_ASSUMPTIONS.ccRefreshPeriodYears;
  
  // Simulate year by year
  for (let year = 0; year < MODEL_ASSUMPTIONS.maxYears; year++) {
    // Project income with growth
    const income_t = compound(baseIncome, MODEL_ASSUMPTIONS.incomeGrowthRate, year);
    
    // Get kids count for this year
    const kids_t = getKidsCountAtYear(inputs, year);
    
    // Project cost of living with inflation and kids
    const colBase_t = getHouseholdCost(state, inputs.householdType, kids_t);
    const col_t = compound(colBase_t, MODEL_ASSUMPTIONS.inflationRate, year);
    
    // Disposable income
    const disp_t = Math.max(0, income_t - col_t);
    
    if (disp_t <= 0) {
      notes.push(`Disposable income becomes negative at year ${year} due to cost of living increases.`);
      break;
    }
    
    // Budget from allocation
    const budget_t = disp_t * (inputs.allocationPercent || 0);
    
    // Calculate minimum required payments
    const interestLoan_t = loanBalance * (inputs.studentLoanRate || 0);
    const interestCC_t = ccBalance * (inputs.creditCardApr || 0);
    
    const loanProgressBuffer = MODEL_ASSUMPTIONS.requireDebtNotToGrow 
      ? (disp_t * MODEL_ASSUMPTIONS.loanProgressBufferPercent)
      : 0;
    
    const minLoanPay_t = interestLoan_t + (loanBalance > 0 ? loanProgressBuffer : 0);
    const minCcPay_t = interestCC_t + (ccBalance > 0 ? (MODEL_ASSUMPTIONS.requireDebtNotToGrow ? (disp_t * 0.01) : 0) : 0);
    
    // Calculate mortgage payment if home purchased
    const homeValue_t = compound(baseHomeValue, MODEL_ASSUMPTIONS.homePriceGrowthRate, year);
    const annualMortgagePayment = homePurchased 
      ? calcMortgageAnnualPayment(homeValue_t, downPaymentPercent, mortgageRate)
      : 0;
    
    // Calculate required allocation percent for this year
    const requiredAlloc_t = homePurchased
      ? (minLoanPay_t + minCcPay_t + annualMortgagePayment) / disp_t
      : (minLoanPay_t + minCcPay_t) / disp_t;
    
    maxRequiredAllocationPercent = Math.max(maxRequiredAllocationPercent, requiredAlloc_t);
    
    // Check if budget is sufficient
    if (budget_t < minLoanPay_t + minCcPay_t + annualMortgagePayment) {
      if (homePurchased) {
        notes.push(`Budget becomes insufficient to sustain mortgage at year ${year} (required: ${(requiredAlloc_t * 100).toFixed(1)}%, allocated: ${(inputs.allocationPercent * 100).toFixed(1)}%).`);
        break;
      } else if (budget_t < minLoanPay_t + minCcPay_t) {
        notes.push(`Allocation too low to prevent debt growth at year ${year} (required: ${(requiredAlloc_t * 100).toFixed(1)}%, allocated: ${(inputs.allocationPercent * 100).toFixed(1)}%).`);
      }
    }
    
    // Allocate payments (optimal strategy)
    let P_loan_t: number;
    let P_cc_t: number;
    let P_save_t: number;
    
    if (homePurchased) {
      // After purchase: pay mortgage first, then debts, no savings
      P_loan_t = Math.max(0, Math.min(loanBalance + interestLoan_t, budget_t - annualMortgagePayment - minCcPay_t));
      P_cc_t = Math.max(0, Math.min(ccBalance + interestCC_t, budget_t - annualMortgagePayment - P_loan_t));
      P_save_t = 0;
    } else {
      // Before purchase: pay minimums on debts, put rest in savings
      P_loan_t = Math.min(loanBalance + interestLoan_t, minLoanPay_t);
      P_cc_t = Math.min(ccBalance + interestCC_t, minCcPay_t);
      P_save_t = Math.max(0, budget_t - P_loan_t - P_cc_t);
    }
    
    // Update balances
    loanBalance = Math.max(0, loanBalance + interestLoan_t - P_loan_t);
    ccBalance = Math.max(0, ccBalance + interestCC_t - P_cc_t);
    
    // Credit card refresh (every N years)
    if ((year + 1) % MODEL_ASSUMPTIONS.ccRefreshPeriodYears === 0) {
      ccBalance += ccRefreshAmount;
    }
    
    // Savings growth
    savingsBalance = (savingsBalance + P_save_t) * (1 + (inputs.savingsRate || 0));
    
    // Check if home can be purchased
    if (!homePurchased) {
      const downPayment_t = homeValue_t * downPaymentPercent;
      const closingBuffer_t = homeValue_t * MODEL_ASSUMPTIONS.closingCostRate;
      const target_t = downPayment_t + closingBuffer_t;
      
      if (savingsBalance >= target_t) {
        // Check if purchase is sustainable
        const futureYearsCheck = Math.min(5, MODEL_ASSUMPTIONS.maxYears - year - 1);
        let sustainable = true;
        
        for (let checkYear = year + 1; checkYear <= year + futureYearsCheck; checkYear++) {
          const futureIncome = compound(baseIncome, MODEL_ASSUMPTIONS.incomeGrowthRate, checkYear);
          const futureKids = getKidsCountAtYear(inputs, checkYear);
          const futureColBase = getHouseholdCost(state, inputs.householdType, futureKids);
          const futureCol = compound(futureColBase, MODEL_ASSUMPTIONS.inflationRate, checkYear);
          const futureDisp = Math.max(0, futureIncome - futureCol);
          const futureHomeValue = compound(baseHomeValue, MODEL_ASSUMPTIONS.homePriceGrowthRate, checkYear);
          const futureMortgage = calcMortgageAnnualPayment(futureHomeValue, downPaymentPercent, mortgageRate);
          
          const futureLoanInterest = loanBalance * (inputs.studentLoanRate || 0);
          const futureCcInterest = ccBalance * (inputs.creditCardApr || 0);
          const futureMinDebt = futureLoanInterest + futureCcInterest + (futureDisp * MODEL_ASSUMPTIONS.loanProgressBufferPercent);
          const futureRequired = (futureMinDebt + futureMortgage) / futureDisp;
          
          if (futureRequired > inputs.allocationPercent || futureDisp <= 0) {
            sustainable = false;
            break;
          }
        }
        
        if (sustainable) {
          homePurchased = true;
          homePurchaseYear = year;
          yearsToHome = year;
        }
      }
    }
    
    // Check if debt free
    if (yearsToDebtFree === null && loanBalance <= 0 && ccBalance <= 0) {
      yearsToDebtFree = year;
    }
    
    // Early exit if both goals achieved
    if (homePurchased && yearsToDebtFree !== null) {
      break;
    }
  }
  
  // Calculate final mortgage payment (at purchase year home value or current year if not purchased)
  const finalYearForMortgage = homePurchaseYear !== null ? homePurchaseYear : MODEL_ASSUMPTIONS.maxYears - 1;
  const homeValueAtPurchase = compound(baseHomeValue, MODEL_ASSUMPTIONS.homePriceGrowthRate, finalYearForMortgage);
  const monthlyMortgagePayment = calcMortgageMonthlyPayment(
    homeValueAtPurchase,
    downPaymentPercent,
    mortgageRate
  );
  
  // Recommended allocation is max of required and user's current, rounded up to next 5%
  const recommendedAllocationPercent = Math.min(1.0, Math.ceil(maxRequiredAllocationPercent * 20) / 20);
  
  // Determine credit card plan (simplified: use reserve if refresh amount > 0)
  const creditCardPlan: "upfront-only" | "reserve" = ccRefreshAmount > 0 ? "reserve" : "upfront-only";
  
  return {
    yearsToHome,
    yearsToDebtFree,
    monthlyMortgagePayment,
    requiredAllocationPercent: maxRequiredAllocationPercent,
    recommendedAllocationPercent,
    notes,
    creditCardPlan,
  };
};

// ============================================================================
// CLASSIFICATION LOGIC
// ============================================================================

const getClassification = (
  yearsToHome: number | null,
  yearsToDebtFree: number | null,
  requiredAllocationPercent: number,
  userAllocationPercent: number,
  disposableIncomeNow: number,
): StateResult["classification"] => {
  // Check if user allocation is insufficient but could work with higher allocation
  const gap = userAllocationPercent - requiredAllocationPercent;
  if (gap < 0) {
    return "Viable with a higher % allocated";
  }
  
  // Calculate viability score (0-100)
  let score = 0;
  
  // Home speed score (0-40): faster yearsToHome = higher score
  if (yearsToHome !== null) {
    if (yearsToHome <= 5) score += 40;
    else if (yearsToHome <= 10) score += 30;
    else if (yearsToHome <= 15) score += 20;
    else if (yearsToHome <= 20) score += 10;
    else score += 5;
  }
  
  // Debt speed score (0-30): faster yearsToDebtFree = higher score
  if (yearsToDebtFree !== null) {
    if (yearsToDebtFree <= 5) score += 30;
    else if (yearsToDebtFree <= 10) score += 22;
    else if (yearsToDebtFree <= 15) score += 15;
    else if (yearsToDebtFree <= 20) score += 8;
    else score += 3;
  }
  
  // Buffer score (0-20): positive margin between allocation and required = higher score
  if (gap > 0) {
    if (gap >= 0.2) score += 20;
    else if (gap >= 0.15) score += 15;
    else if (gap >= 0.1) score += 10;
    else if (gap >= 0.05) score += 5;
  }
  
  // Disposable income score (0-10): higher disposable income = higher score
  if (disposableIncomeNow >= 50000) score += 10;
  else if (disposableIncomeNow >= 30000) score += 7;
  else if (disposableIncomeNow >= 15000) score += 5;
  else if (disposableIncomeNow >= 5000) score += 3;
  else if (disposableIncomeNow > 0) score += 1;
  
  // Map score to classification
  if (score >= 80) return "Very viable and stable";
  if (score >= 60) return "Viable";
  if (score >= 40) return "Viable with extreme care";
  if (score >= 20) return "Viable only when renting";
  return "No viable path";
};

const calculateViabilityRating = (
  classification: StateResult["classification"],
  yearsToDebtFree: number | null,
  yearsToHome: number | null,
): number => {
  // Base rating from classification
  const classificationScores: Record<StateResult["classification"], number> = {
    "Very viable and stable": 10,
    "Viable": 8,
    "Viable with a higher % allocated": 6,
    "Viable with extreme care": 5,
    "Viable only when renting": 3,
    "No viable path": 0,
  };

  let rating = classificationScores[classification];

  // Adjust based on timeline (faster = higher rating)
  if (yearsToDebtFree !== null && yearsToDebtFree <= 5) {
    rating += 0.5;
  } else if (yearsToDebtFree !== null && yearsToDebtFree <= 10) {
    rating += 0.2;
  } else if (yearsToDebtFree === null) {
    rating -= 1;
  }

  if (yearsToHome !== null && yearsToHome <= 5) {
    rating += 0.3;
  } else if (yearsToHome !== null && yearsToHome <= 10) {
    rating += 0.1;
  } else if (yearsToHome === null) {
    rating -= 0.5;
  }

  // Clamp to 0-10
  return Math.max(0, Math.min(10, Math.round(rating * 10) / 10));
};

// ============================================================================
// MAIN CALCULATION FUNCTIONS
// ============================================================================

export const calculateStateResult = (
  state: StateData,
  inputs: UserInputs,
  strategy: Strategy, // Kept for compatibility, but not used in new model
): StateResult => {
  const stateName = typeof state.name === "string" ? state.name : "";
  const stateAbbr = typeof state.abbr === "string" ? state.abbr : "";
  
  // Run simulation
  const simulation = simulateState(inputs, state);
  
  // Get initial values for display
  const primaryIncome = inputs.incomeSource === "occupation" 
    ? getSalary(state, inputs.occupation, inputs.salaryOverride)
    : (inputs.salaryOverride || 0);
  
  const partnerIncome = inputs.householdType === "marriedTwoIncome"
    ? (inputs.partnerIncomeSource === "occupation"
      ? getSalary(state, inputs.partnerOccupation || "", inputs.partnerSalaryOverride)
      : (inputs.partnerSalaryOverride || 0))
    : 0;
  
  const combinedIncome = primaryIncome + partnerIncome;
  const costOfLiving = getHouseholdCost(state, inputs.householdType, inputs.kids);
  const disposableIncome = Math.max(0, combinedIncome - costOfLiving);
  
  // Get home value for display
  const homeSizeKeyMap: Record<HomeSize, string> = {
    small: "typical_home_value_small",
    medium: "typical_home_value_single_family_normal",
    large: "typical_home_value_large",
    veryLarge: "typical_home_value_very_large",
  };
  const homeValueKey = homeSizeKeyMap[inputs.homeSize] || "typical_home_value_single_family_normal";
  const stateData = state as Record<string, unknown>;
  const homeValue = safeNumber(stateData[homeValueKey]);
  const mortgageRate = safeNumber(stateData["average_mortgage_rate_fixed_30_year"]);
  const downPaymentPercent = safeNumber(stateData["median_mortgage_down_payment_percent"]);
  
  // Calculate legacy fields for backward compatibility
  const minDebtPercent = simulation.requiredAllocationPercent * 0.5; // Rough estimate
  const minCreditPercent = simulation.requiredAllocationPercent * 0.1; // Rough estimate
  const savingsPercent = simulation.requiredAllocationPercent > 0 
    ? Math.max(0, inputs.allocationPercent - simulation.requiredAllocationPercent)
    : inputs.allocationPercent;
  
  // Get classification
  const classification = getClassification(
    simulation.yearsToHome,
    simulation.yearsToDebtFree,
    simulation.requiredAllocationPercent,
    inputs.allocationPercent,
    disposableIncome
  );
  
  // Calculate viability rating
  const viabilityRating = calculateViabilityRating(
    classification,
    simulation.yearsToDebtFree,
    simulation.yearsToHome
  );
  
  return {
    state: stateName,
    stateAbbr,
    classification,
    viabilityRating,
    disposableIncome,
    combinedIncome,
    minDebtPercent,
    minCreditPercent,
    savingsPercent,
    yearsToHome: simulation.yearsToHome,
    yearsToDebtFree: simulation.yearsToDebtFree,
    homeValue,
    mortgageRate,
    downPaymentPercent,
    strategy, // Keep for backward compatibility
    creditCardPlan: simulation.creditCardPlan,
    notes: simulation.notes,
    // New fields
    monthlyMortgagePayment: simulation.monthlyMortgagePayment,
    requiredAllocationPercent: simulation.requiredAllocationPercent,
    recommendedAllocationPercent: simulation.recommendedAllocationPercent,
  };
};

export const calculateResults = (inputs: UserInputs) => {
  const allStates = getAllStates();

  const states =
    inputs.locationCertainty === "unknown"
      ? allStates
      : allStates.filter((state) => {
          const abbr = typeof state.abbr === "string" ? state.abbr : "";
          return abbr ? inputs.selectedStates.includes(abbr) : false;
        });

  return states.map((state) => {
    // Strategy mode is kept for compatibility but not used in new simulation model
    if (inputs.strategyMode !== "auto") {
      return calculateStateResult(state, inputs, inputs.strategyMode);
    }
    // For "auto", use balanced strategy
    return calculateStateResult(state, inputs, "balanced");
  });
};

// Export alias for calculateResults
export const calculateAffordability = calculateResults;