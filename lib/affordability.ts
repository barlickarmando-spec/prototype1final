import stateDataRaw from "../data/state_data.json";
import dictRaw from "../data/data_dictionary.json";

export type HouseholdType = "single" | "marriedOneIncome" | "marriedTwoIncome";
export type Strategy = "conservative" | "balanced" | "aggressive";
export type StrategyMode = Strategy | "auto";
export type LocationCertainty = "sure" | "deciding" | "unknown";

export type UserInputs = {
  age: number;
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

const STRATEGY_WEIGHTS: Record<Strategy, number> = {
  conservative: 0.7,
  balanced: 0.85,
  aggressive: 1,
};

// Classification based on years to debt-free (primary metric)
// Ordered from most restrictive (lowest maxYears) to least restrictive
const CLASSIFICATION_BY_DEBT_FREE: Array<{
  maxYears: number | null; // null means any number is valid
  label: StateResult["classification"];
}> = [
  { maxYears: 5, label: "Very viable and stable" }, // Debt-free in 5 years or less
  { maxYears: 10, label: "Viable" }, // Debt-free in 6-10 years
  { maxYears: 20, label: "Viable with extreme care" }, // Debt-free in 11-20 years
  { maxYears: null, label: "Viable only when renting" }, // Debt-free in 20+ years or null
];

// Legacy classification by savings percent (kept as fallback)
const CLASSIFICATION_LABELS: Array<{
  minSavingsPercent: number;
  label: StateResult["classification"];
}> = [
  { minSavingsPercent: 0.45, label: "Very viable and stable" },
  { minSavingsPercent: 0.3, label: "Viable" },
  { minSavingsPercent: 0.18, label: "Viable with extreme care" },
  { minSavingsPercent: 0.05, label: "Viable only when renting" },
  { minSavingsPercent: 0, label: "No viable path" },
];

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

  // Known occupation keys from data dictionary (lines 23-44)
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

// Calculate annual mortgage payment using PMT formula
// PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
// Where P = principal (homeValue - downPayment), r = monthly rate, n = 360 months (30 years)
const calculateAnnualMortgagePayment = (
  homeValue: number,
  mortgageRate: number,
  downPaymentPercent: number
): number => {
  if (homeValue <= 0 || mortgageRate <= 0) return 0;
  
  const downPayment = homeValue * downPaymentPercent;
  const principal = homeValue - downPayment;
  if (principal <= 0) return 0;
  
  const monthlyRate = mortgageRate / 12;
  const numPayments = 30 * 12; // 30 years
  const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
    (Math.pow(1 + monthlyRate, numPayments) - 1);
  
  return monthlyPayment * 12; // Annual payment
};

const calculateYearsToTarget = (
  yearOneSavings: number,
  recurringSavings: number,
  savingsRate: number,
  target: number,
) => {
  if (yearOneSavings <= 0) return null;
  let balance = 0;
  for (let year = 1; year <= 80; year += 1) {
    const contribution = year === 1 ? yearOneSavings : recurringSavings;
    balance = (balance + contribution) * (1 + savingsRate);
    if (balance >= target) return year;
  }
  return null;
};

const calculateDebtFreeYears = (
  principal: number,
  rate: number,
  yearOnePayment: number,
  recurringPayment: number,
) => {
  if (principal <= 0) return 0;
  let balance = principal;
  for (let year = 1; year <= 80; year += 1) {
    const payment = year === 1 ? yearOnePayment : recurringPayment;
    if (payment <= balance * rate) return null;
    balance = balance + balance * rate - payment;
    if (balance <= 0) return year;
  }
  return null;
};

const getClassification = (
  savingsPercent: number,
  yearsToDebtFree: number | null,
  minRequiredPercent: number,
  userAllocationPercent: number,
) => {
  // Check if user allocation is insufficient but could work with higher allocation
  const gap = userAllocationPercent - minRequiredPercent;
  if (gap < 0 && yearsToDebtFree === null) {
    // Could be viable with higher allocation
    return "Viable with a higher % allocated";
  }

  // Primary classification: based on years to debt-free
  if (yearsToDebtFree === null) {
    // If no path to debt-free, it's either "Viable only when renting" or "No viable path"
    // Check based on savings percentage as a fallback
    if (savingsPercent >= 0.05) {
      return "Viable only when renting";
    }
    return "No viable path";
  }

  // Classify based on years to debt-free
  // Check tiers in order (most restrictive first)
  for (const tier of CLASSIFICATION_BY_DEBT_FREE) {
    if (tier.maxYears === null) {
      // Skip null tiers (handled separately below)
      continue;
    }
    if (yearsToDebtFree <= tier.maxYears) {
      return tier.label;
    }
  }

  // If years > 20, use "Viable only when renting" or "No viable path" based on savings
  const rentTier = CLASSIFICATION_BY_DEBT_FREE.find((t) => t.maxYears === null);
  if (rentTier && savingsPercent >= 0.05) {
    return rentTier.label; // "Viable only when renting"
  }

  // Fallback to "No viable path"
  return "No viable path";
};

// Calculate viability rating (0-10)
const calculateViabilityRating = (
  classification: StateResult["classification"],
  yearsToDebtFree: number | null,
  yearsToHome: number | null,
  savingsPercent: number,
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

  // Adjust based on savings margin
  if (savingsPercent >= 0.3) {
    rating += 0.2;
  } else if (savingsPercent < 0.1) {
    rating -= 0.3;
  }

  // Clamp to 0-10
  return Math.max(0, Math.min(10, Math.round(rating * 10) / 10));
};

const buildPlan = ({
  allocationPercent,
  strategy,
  minLoanPercent,
  creditCardUpfront,
  creditCardReserve,
}: {
  disposableIncome: number; // kept for signature compatibility; unused
  allocationPercent: number;
  strategy: Strategy;
  minLoanPercent: number;
  creditCardUpfront: number;
  creditCardReserve: number;
}) => {
  const housingWeight = STRATEGY_WEIGHTS[strategy];
  const yearOneAvailable = allocationPercent - minLoanPercent - creditCardUpfront;
  const recurringAvailable = allocationPercent - minLoanPercent - creditCardReserve;
  if (yearOneAvailable <= 0 || recurringAvailable <= 0) return null;

  const yearOneSavingsPercent = Math.max(0, yearOneAvailable * housingWeight);
  const recurringSavingsPercent = Math.max(0, recurringAvailable * housingWeight);
  const yearOneDebtPercent = minLoanPercent + (yearOneAvailable - yearOneSavingsPercent);
  const recurringDebtPercent =
    minLoanPercent + (recurringAvailable - recurringSavingsPercent);

  return {
    yearOneSavingsPercent,
    recurringSavingsPercent,
    yearOneDebtPercent,
    recurringDebtPercent,
  };
};

export const calculateStateResult = (
  state: StateData,
  inputs: UserInputs,
  strategy: Strategy,
): StateResult => {
  const stateName = typeof state.name === "string" ? state.name : "";
  const stateAbbr = typeof state.abbr === "string" ? state.abbr : "";

  const primaryIncome = getSalary(state, inputs.occupation, inputs.salaryOverride);
  const partnerIncome =
    inputs.householdType === "marriedTwoIncome"
      ? getSalary(state, inputs.partnerOccupation ?? "", inputs.partnerSalaryOverride)
      : 0;

  const combinedIncome = primaryIncome + partnerIncome;
  const costOfLiving = getHouseholdCost(state, inputs.householdType, inputs.kids);
  const disposableIncome = combinedIncome - costOfLiving;
  const notes: string[] = [];

  if (combinedIncome <= 0) {
    notes.push("Missing occupation data for this state.");
  }

  // Map homeSize to flat JSON key
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

  if (disposableIncome <= 0) {
    const classification = "No viable path";
    return {
      state: stateName,
      stateAbbr,
      classification,
      viabilityRating: 0,
      disposableIncome,
      combinedIncome,
      minDebtPercent: 0,
      minCreditPercent: 0,
      savingsPercent: 0,
      yearsToHome: null,
      yearsToDebtFree: null,
      homeValue,
      mortgageRate,
      downPaymentPercent,
      strategy,
      creditCardPlan: "upfront-only", // FIX: required by StateResult
      notes: [
        ...notes,
        "Disposable income is negative at the current household size.",
      ],
    };
  }

  // Guard: avoid divide-by-zero even if disposableIncome is extremely small
  const safeDisposable = disposableIncome > 0 ? disposableIncome : 1;

  const minLoanPercent =
    (inputs.studentLoanBalance * inputs.studentLoanRate + safeDisposable * 0.05) /
    safeDisposable;

  const creditCardUpfront =
    (inputs.creditCardBalance + inputs.creditCardBalance * inputs.creditCardApr) /
    safeDisposable;

  const creditCardReserve = creditCardUpfront / 5;

  const upfrontPlan = buildPlan({
    disposableIncome,
    allocationPercent: inputs.allocationPercent,
    strategy,
    minLoanPercent,
    creditCardUpfront,
    creditCardReserve: 0,
  });

  const reservePlan = buildPlan({
    disposableIncome,
    allocationPercent: inputs.allocationPercent,
    strategy,
    minLoanPercent,
    creditCardUpfront,
    creditCardReserve,
  });

  const downPayment = homeValue * downPaymentPercent;
  const target = downPayment;

  const planOptions = [
    { label: "upfront-only" as const, plan: upfrontPlan },
    { label: "reserve" as const, plan: reservePlan },
  ];

  const scoredPlans = planOptions.map(({ label, plan }) => {
    if (!plan) return null;
    const yearsToHome = calculateYearsToTarget(
      disposableIncome * plan.yearOneSavingsPercent,
      disposableIncome * plan.recurringSavingsPercent,
      inputs.savingsRate,
      target,
    );
    const yearsToDebtFree = calculateDebtFreeYears(
      inputs.studentLoanBalance,
      inputs.studentLoanRate,
      disposableIncome * plan.yearOneDebtPercent,
      disposableIncome * plan.recurringDebtPercent,
    );
    return {
      label,
      plan,
      yearsToHome,
      yearsToDebtFree,
    };
  });

  const viablePlans = scoredPlans.filter(
    (plan): plan is NonNullable<typeof plan> => plan !== null,
  );

  if (viablePlans.length === 0) {
    const classification = "No viable path";
    return {
      state: stateName,
      stateAbbr,
      classification,
      viabilityRating: calculateViabilityRating(classification, null, null, 0),
      disposableIncome,
      combinedIncome,
      minDebtPercent: minLoanPercent,
      minCreditPercent: creditCardUpfront,
      savingsPercent: 0,
      yearsToHome: null,
      yearsToDebtFree: null,
      homeValue,
      mortgageRate,
      downPaymentPercent,
      strategy,
      creditCardPlan: "upfront-only",
      notes: [
        ...notes,
        "Allocation is insufficient to cover minimum debt obligations.",
      ],
    };
  }

  const bestPlan = viablePlans.reduce((winner, current) => {
    if (winner.yearsToHome === null) return current;
    if (current.yearsToHome === null) return winner;
    if (current.yearsToHome !== winner.yearsToHome) {
      return current.yearsToHome < winner.yearsToHome ? current : winner;
    }
    if (current.yearsToDebtFree === null) return winner;
    if (winner.yearsToDebtFree === null) return current;
    return current.yearsToDebtFree < winner.yearsToDebtFree ? current : winner;
  });

  const savingsPercent = bestPlan.plan.recurringSavingsPercent;
  const yearsToHome = bestPlan.yearsToHome;
  const yearsToDebtFree = bestPlan.yearsToDebtFree;
  const minRequiredPercent = minLoanPercent + creditCardUpfront;
  const userAllocationPercent = inputs.allocationPercent;

  if (yearsToHome === null) {
    notes.push("Savings allocation cannot reach a down payment.");
  }

  if (yearsToDebtFree === null) {
    notes.push("Student loan payment is too low to reduce the balance.");
  }

  // Check if mortgage payment is affordable after home purchase
  // Account for future cost of living with kids if applicable
  let futureCostOfLiving = costOfLiving;
  let futureKids = inputs.kids;
  if (inputs.advanced?.futureKids) {
    if (inputs.advanced.firstChildAge) {
      // Assume at least one kid by home purchase if first child age is set
      futureKids = Math.max(futureKids, 1);
    }
    if (inputs.advanced.secondChildAge) {
      futureKids = Math.max(futureKids, 2);
    }
    futureCostOfLiving = getHouseholdCost(state, inputs.householdType, futureKids);
  }
  
  const annualMortgagePayment = calculateAnnualMortgagePayment(homeValue, mortgageRate, downPaymentPercent);
  
  // Calculate disposable income after mortgage (if home purchased)
  // This checks affordability: income - cost of living (with kids) - mortgage - debt payments
  const futureDisposableAfterMortgage = combinedIncome - futureCostOfLiving - annualMortgagePayment;
  const requiredAfterMortgage = (disposableIncome * minLoanPercent) + 
                                (inputs.creditCardBalance > 0 ? (disposableIncome * creditCardUpfront / 5) : 0);
  
  if (yearsToHome !== null && futureDisposableAfterMortgage < requiredAfterMortgage) {
    notes.push(`Warning: After home purchase, annual mortgage payment ($${Math.round(annualMortgagePayment).toLocaleString()}) may strain finances when combined with debt obligations.`);
  }

  const classification = getClassification(
    savingsPercent,
    yearsToDebtFree,
    minRequiredPercent,
    userAllocationPercent,
  );

  return {
    state: stateName,
    stateAbbr,
    classification,
    viabilityRating: calculateViabilityRating(
      classification,
      yearsToDebtFree,
      yearsToHome,
      savingsPercent,
    ),
    disposableIncome,
    combinedIncome,
    minDebtPercent: minLoanPercent,
    minCreditPercent: creditCardUpfront,
    savingsPercent,
    yearsToHome,
    yearsToDebtFree,
    homeValue,
    mortgageRate,
    downPaymentPercent,
    strategy,
    creditCardPlan: bestPlan.label,
    notes,
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
    if (inputs.strategyMode !== "auto") {
      return calculateStateResult(state, inputs, inputs.strategyMode);
    }
    const strategies: Strategy[] = ["conservative", "balanced", "aggressive"];
    const results = strategies.map((strategy) =>
      calculateStateResult(state, inputs, strategy),
    );
    const viable = results.filter((result) => result.yearsToHome !== null);
    if (viable.length === 0) return results[1];
    const best = viable.reduce((winner, current) => {
      if (winner.yearsToHome === null) return current;
      if (current.yearsToHome === null) return winner;
      if (current.yearsToHome !== winner.yearsToHome) {
        return current.yearsToHome < winner.yearsToHome ? current : winner;
      }
      if (current.yearsToDebtFree === null) return winner;
      if (winner.yearsToDebtFree === null) return current;
      return current.yearsToDebtFree < winner.yearsToDebtFree ? current : winner;
    });
    return best;
  });
};

// Export alias for calculateResults (as specified in requirements)
export const calculateAffordability = calculateResults;
