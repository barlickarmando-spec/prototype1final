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
    | "Viable"
    | "Very viable and stable";
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
 * - Normalize JSON so it works whether the export is { states: [...] } or [...]
 * - All reads must be defensive; never assume keys exist.
 */
type HomeSize = UserInputs["homeSize"];

export type StateData = {
  name?: string;
  abbr?: string;
  occupations?: Record<string, unknown>;
  costOfLiving?: Partial<
    Record<HouseholdType, Partial<Record<"0" | "1" | "2", unknown>>>
  >;
  homeValues?: Partial<Record<HomeSize, unknown>>;
  mortgageRate?: unknown;
  downPaymentPercent?: unknown;
  // allow extra keys without breaking
  [key: string]: unknown;
};

const normalizeStates = (): StateData[] => {
  const raw = stateDataRaw as unknown;
  // shape A: { states: [...] }
  if (
    raw &&
    typeof raw === "object" &&
    "states" in (raw as Record<string, unknown>) &&
    Array.isArray((raw as Record<string, unknown>).states)
  ) {
    return ((raw as Record<string, unknown>).states as unknown[]).filter(
      (s): s is StateData => !!s && typeof s === "object",
    );
  }
  // shape B: [...]
  if (Array.isArray(raw)) {
    return raw.filter((s): s is StateData => !!s && typeof s === "object");
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

  states.forEach((state) => {
    const occ = state.occupations;
    if (!occ || typeof occ !== "object") return;
    Object.keys(occ).forEach((occupation) => {
      if (occupation) occupations.add(occupation);
    });
  });

  return Array.from(occupations)
    .sort()
    .map((occupation) => ({ value: occupation, label: occupation }));
};

export const getStateByName = (name: string) => {
  const states = getAllStates();
  return states.find((state) => state.name === name || state.abbr === name);
};

const getHouseholdCost = (
  state: StateData,
  householdType: HouseholdType,
  kids: number,
) => {
  const key = clampKids(kids);
  const col = state.costOfLiving?.[householdType]?.[key];
  return safeNumber(col);
};

const getSalary = (state: StateData, occupation: string, override?: number) => {
  if (typeof override === "number" && override > 0) return override;
  const raw = state.occupations?.[occupation];
  return safeNumber(raw);
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

const getClassification = (savingsPercent: number) => {
  const match = CLASSIFICATION_LABELS.find(
    (tier) => savingsPercent >= tier.minSavingsPercent,
  );
  return match?.label ?? "No viable path";
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

  const homeValue = safeNumber(state.homeValues?.[inputs.homeSize]);
  const mortgageRate = safeNumber(state.mortgageRate);
  const downPaymentPercent = safeNumber(state.downPaymentPercent);

  if (disposableIncome <= 0) {
    return {
      state: stateName,
      stateAbbr,
      classification: "No viable path",
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
  const annualMortgageInterest = homeValue * mortgageRate;
  const target = downPayment + annualMortgageInterest;

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
    return {
      state: stateName,
      stateAbbr,
      classification: "No viable path",
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

  if (yearsToHome === null) {
    notes.push("Savings allocation cannot reach a down payment.");
  }

  if (yearsToDebtFree === null) {
    notes.push("Student loan payment is too low to reduce the balance.");
  }

  return {
    state: stateName,
    stateAbbr,
    classification: getClassification(savingsPercent),
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
