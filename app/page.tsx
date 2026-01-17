"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getOccupations,
  getStates,
  type HouseholdType,
  type LocationCertainty,
  type StrategyMode,
  type UserInputs,
} from "../lib/affordability";

const DEFAULT_INPUTS: UserInputs = {
  age: 0,
  academicStatus: undefined,
  financialAssistance: undefined,
  financialAssistanceDuration: undefined,
  personalizationPrompt: undefined,
  locationCertainty: "sure",
  selectedStates: [],
  householdType: "single",
  kids: 0,
  incomeSource: "occupation",
  occupation: "",
  partnerOccupation: "",
  salaryOverride: undefined,
  partnerIncomeSource: "occupation",
  partnerSalaryOverride: undefined,
  studentLoanBalance: 0,
  studentLoanRate: 0,
  creditCardBalance: 0,
  creditCardApr: 0,
  savingsRate: 0,
  allocationPercent: 0,
  homeSize: "medium",
  strategyMode: "auto",
  advanced: {
    futureKids: false,
    studentLoanStyle: "standard",
  },
};

export default function Home() {
  const router = useRouter();
  const [inputs, setInputs] = useState<UserInputs>(DEFAULT_INPUTS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stateQuery, setStateQuery] = useState("");
  const [occupationQuery, setOccupationQuery] = useState("");
  const [partnerOccupationQuery, setPartnerOccupationQuery] = useState("");
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [showOccupationDropdown, setShowOccupationDropdown] = useState(false);
  const [showPartnerOccupationDropdown, setShowPartnerOccupationDropdown] =
    useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPersonalization, setShowPersonalization] = useState(false);

  const states = useMemo(() => getStates(), []);
  const occupations = useMemo(() => getOccupations(), []);

  // Get state flag image URL (try local first, fallback to CDN)
  const getStateFlagUrl = (stateAbbr: string): string => {
    const abbrLower = stateAbbr.toLowerCase();
    // Try local assets first, fallback to CDN
    return `/flags/us-states/${abbrLower}.svg`;
  };

  const filteredStates = useMemo(() => {
    if (!stateQuery) return states;
    return states.filter(
      (state) =>
        state.label.toLowerCase().includes(stateQuery.toLowerCase()) ||
        state.value.toLowerCase().includes(stateQuery.toLowerCase()),
    );
  }, [states, stateQuery]);

  const filteredOccupations = useMemo(() => {
    if (!occupationQuery) return occupations;
    return occupations.filter(
      (occupation) =>
        occupation.label.toLowerCase().includes(occupationQuery.toLowerCase()) ||
        occupation.value.toLowerCase().includes(occupationQuery.toLowerCase()),
    );
  }, [occupations, occupationQuery]);

  const filteredPartnerOccupations = useMemo(() => {
    if (!partnerOccupationQuery) return occupations;
    return occupations.filter(
      (occupation) =>
        occupation.label.toLowerCase().includes(partnerOccupationQuery.toLowerCase()) ||
        occupation.value.toLowerCase().includes(partnerOccupationQuery.toLowerCase()),
    );
  }, [occupations, partnerOccupationQuery]);

  const selectedOccupationLabel = occupations.find(o => o.value === inputs.occupation)?.label || "";
  const selectedPartnerOccupationLabel = occupations.find(o => o.value === inputs.partnerOccupation)?.label || "";

  // Refs for dropdown containers to detect outside clicks
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const occupationDropdownRef = useRef<HTMLDivElement>(null);
  const partnerOccupationDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        stateDropdownRef.current &&
        !stateDropdownRef.current.contains(event.target as Node)
      ) {
        setShowStateDropdown(false);
      }
      if (
        occupationDropdownRef.current &&
        !occupationDropdownRef.current.contains(event.target as Node)
      ) {
        setShowOccupationDropdown(false);
      }
      if (
        partnerOccupationDropdownRef.current &&
        !partnerOccupationDropdownRef.current.contains(event.target as Node)
      ) {
        setShowPartnerOccupationDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Close other dropdowns when opening a new one
  const openStateDropdown = () => {
    setShowOccupationDropdown(false);
    setShowPartnerOccupationDropdown(false);
    setShowStateDropdown(true);
  };

  const openOccupationDropdown = () => {
    setShowStateDropdown(false);
    setShowPartnerOccupationDropdown(false);
    setShowOccupationDropdown(true);
  };

  const openPartnerOccupationDropdown = () => {
    setShowStateDropdown(false);
    setShowOccupationDropdown(false);
    setShowPartnerOccupationDropdown(true);
  };

  const updateInputs = (patch: Partial<UserInputs>) => {
    setInputs((current) => ({ ...current, ...patch }));
  };

  const percentToInput = (value: number) =>
    Number.isFinite(value) ? String(Math.round(value * 1000) / 10) : "";

  const inputToPercent = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed / 100;
  };

  // Handle number input to replace "0" when user starts typing (allows decimals)
  const handleNumberChange = (
    value: string,
    currentValue: number,
    updateFn: (value: number) => void,
  ) => {
    // Allow empty string
    if (value === "") {
      updateFn(0);
      return;
    }
    // If current value is 0 and new value starts with "0" followed by digits (but not decimals), strip leading zero
    if (currentValue === 0 && value.length > 1 && value.startsWith("0") && /^0\d+$/.test(value) && !value.includes(".")) {
      const withoutZero = value.substring(1);
      const parsed = Number(withoutZero);
      if (Number.isFinite(parsed)) {
        updateFn(parsed);
        return;
      }
    }
    // Otherwise, handle normally (allows decimals)
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      updateFn(parsed);
    }
  };

  const updateAdvanced = (patch: Partial<UserInputs["advanced"]>) => {
    setInputs((current) => ({
      ...current,
      advanced: { ...current.advanced, ...patch },
    }));
  };

  const handleStateToggle = (stateValue: string) => {
    if (inputs.locationCertainty === "sure") {
      updateInputs({ selectedStates: [stateValue] });
      setShowStateDropdown(false);
      return;
    }
    if (inputs.selectedStates.includes(stateValue)) {
      updateInputs({
        selectedStates: inputs.selectedStates.filter((s) => s !== stateValue),
      });
      // Close dropdown after deselecting if it's the last item or if deselecting via × button
      setShowStateDropdown(false);
    } else {
      updateInputs({
        selectedStates: [...inputs.selectedStates, stateValue],
      });
    }
  };

  const validateForm = () => {
    if (inputs.locationCertainty !== "unknown" && inputs.selectedStates.length === 0) {
      return "Select at least one state before continuing.";
    }
    if (inputs.incomeSource === "occupation" && !inputs.occupation) {
      return "Select a primary occupation to continue.";
    }
    if (inputs.incomeSource === "salary" && !inputs.salaryOverride) {
      return "Enter a primary salary to continue.";
    }
    if (inputs.householdType === "marriedTwoIncome") {
      if (inputs.partnerIncomeSource === "salary" && !inputs.partnerSalaryOverride) {
        return "Enter a partner salary for two-income households.";
      }
      if (inputs.partnerIncomeSource !== "salary" && !inputs.partnerOccupation) {
        return "Select a partner occupation for two-income households.";
      }
    }
    return null;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const error = validateForm();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    const payload: UserInputs = {
      ...inputs,
      selectedStates:
        inputs.locationCertainty === "unknown"
          ? []
          : inputs.selectedStates,
      age: Math.max(0, Number(inputs.age) || 0),
      kids: Math.max(0, Number(inputs.kids) || 0),
      studentLoanBalance: Math.max(0, Number(inputs.studentLoanBalance) || 0),
      studentLoanRate: Math.max(0, Number(inputs.studentLoanRate) || 0),
      creditCardBalance: Math.max(0, Number(inputs.creditCardBalance) || 0),
      creditCardApr: Math.max(0, Number(inputs.creditCardApr) || 0),
      savingsRate: Math.max(0, Number(inputs.savingsRate) || 0),
      allocationPercent: Math.max(0, Number(inputs.allocationPercent) || 0),
    };
    window.localStorage.setItem("affordability-inputs", JSON.stringify(payload));
    router.push("/results");
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8">
        <header className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            AFFORDABILITY ANALYSIS
          </p>
          <h1 className="text-3xl font-semibold text-slate-50 leading-tight">
            Estimate your path to home ownership and debt freedom
          </h1>
          <p className="max-w-3xl text-sm text-slate-300 leading-relaxed">
            Start with the core inputs below. After submitting, you will see a
            state-by-state overview, then refine your selections and generate a
            final decision-grade summary.
          </p>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Step 1 of 3 — Inputs</span>
              <span>~2 minutes</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
              <div className="h-1.5 w-1/3 rounded-full bg-slate-50" />
            </div>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Location Certainty */}
          <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">1. Location certainty</h2>
              <div className="h-px bg-slate-700" />
              <p className="text-sm text-slate-300 leading-relaxed">
                Choose how specific you are about where you want to live.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["sure", "I know exactly where I want to live"],
                  ["deciding", "I'm deciding between a few places"],
                  ["unknown", "I have no idea (analyze all states)"],
                ] as Array<[LocationCertainty, string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                    inputs.locationCertainty === value
                      ? "border-slate-600 bg-slate-800 text-slate-50"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="locationCertainty"
                    value={value}
                    className="hidden"
                    checked={inputs.locationCertainty === value}
                    onChange={() => updateInputs({ locationCertainty: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-900">
                Select state(s)
              </label>
              <div className="relative" ref={stateDropdownRef}>
                <input
                  type="text"
                  value={stateQuery}
                  onChange={(event) => {
                    setStateQuery(event.target.value);
                    openStateDropdown();
                  }}
                  onFocus={openStateDropdown}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setShowStateDropdown(false);
                    }
                  }}
                  placeholder="Search or select a state"
                  className={`w-full rounded-lg border pr-10 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 ${
                    showStateDropdown
                      ? "border-slate-600 ring-2 ring-slate-700"
                      : "border-slate-700"
                  }`}
                  disabled={inputs.locationCertainty === "unknown"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  ▾
                </span>
                {showStateDropdown && inputs.locationCertainty !== "unknown" && (
                  <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-lg">
                    {filteredStates.length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-700">
                        No matching states.
                      </p>
                    )}
                    {filteredStates.map((state) => {
                      const selected = inputs.selectedStates.includes(state.value);
                      return (
                        <button
                          key={state.value}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleStateToggle(state.value);
                          }}
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                            selected
                              ? "bg-slate-800 text-slate-50 border border-slate-600"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <img
                              src={getStateFlagUrl(state.value)}
                              alt={`Flag of ${state.label}`}
                              className="h-4 w-auto border border-slate-700 rounded flex-shrink-0"
                              onError={(e) => {
                                // Fallback to CDN if local asset not found
                                const img = e.target as HTMLImageElement;
                                const abbrLower = state.value.toLowerCase();
                                img.src = `https://cdn.jsdelivr.net/gh/jonathanleeper/state-flags@latest/svg/${abbrLower}.svg`;
                                img.onerror = () => {
                                  img.style.display = "none";
                                };
                              }}
                            />
                            <span className="flex-1">{state.label}</span>
                            <span className="text-xs text-slate-500 font-medium">{state.value}</span>
                          </span>
                          {selected && (
                            <span className="ml-2 text-slate-600">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {inputs.selectedStates.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {inputs.selectedStates.map((abbr) => {
                    const state = states.find((s) => s.value === abbr);
                    return (
                      <span
                        key={abbr}
                        className="inline-flex items-center gap-2 rounded-md bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm text-slate-200"
                      >
                        <img
                          src={getStateFlagUrl(abbr)}
                          alt={`Flag of ${state?.label || abbr}`}
                          className="h-4 w-auto border border-slate-700 rounded flex-shrink-0"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = "none";
                          }}
                        />
                        <span>{state?.label}</span>
                        <button
                          type="button"
                          onClick={() => handleStateToggle(abbr)}
                          className="ml-1 text-slate-400 hover:text-slate-200 transition-colors text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-slate-700 font-semibold"
                          aria-label={`Remove ${state?.label}`}
                          title={`Remove ${state?.label}`}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Academic/Career Status */}
          <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">2. Academic & Career Status</h2>
              <div className="h-px bg-slate-700" />
              <p className="text-sm text-slate-300 leading-relaxed">
                Tell us about your current academic and career situation.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["graduated_independent", "Graduated - Financially Independent"],
                ["student_independent", "Student - Financially Independent"],
                ["student_soon_independent", "Student - Soon to be Independent"],
                ["no_college_debt", "No College Debt"],
                ["more_options", "More Options"],
              ] as Array<[NonNullable<UserInputs["academicStatus"]>, string]>).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                    inputs.academicStatus === value
                      ? "border-slate-600 bg-slate-800 text-slate-50"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="academicStatus"
                    value={value}
                    className="hidden"
                    checked={inputs.academicStatus === value}
                    onChange={() => updateInputs({ academicStatus: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
            
            {/* Conditional Age Input Based on Academic Status */}
            {inputs.academicStatus && (
              <div>
                <label className="text-sm font-semibold text-slate-300">
                  {inputs.academicStatus === "graduated_independent" 
                    ? "Current age"
                    : inputs.academicStatus === "student_independent"
                    ? "Current age"
                    : inputs.academicStatus === "student_soon_independent"
                    ? "Age when you plan on graduating/being financially independent"
                    : inputs.academicStatus === "no_college_debt"
                    ? "Current age"
                    : "Age"}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={inputs.age || ""}
                  onChange={(e) =>
                    handleNumberChange(e.target.value, inputs.age || 0, (val) =>
                      updateInputs({ age: Math.max(0, Math.min(100, val)) }),
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  placeholder="25"
                />
              </div>
            )}
          </section>

          {/* Financial Assistance */}
          <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">3. Financial Assistance</h2>
              <div className="h-px bg-slate-700" />
              <p className="text-sm text-slate-300 leading-relaxed">
                Do you have any financial assistance (family support, scholarships, etc.)?
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                  inputs.financialAssistance === true
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="financialAssistance"
                  value="yes"
                  className="hidden"
                  checked={inputs.financialAssistance === true}
                  onChange={() => updateInputs({ financialAssistance: true })}
                />
                Yes
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                  inputs.financialAssistance === false
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="financialAssistance"
                  value="no"
                  className="hidden"
                  checked={inputs.financialAssistance === false}
                  onChange={() => updateInputs({ financialAssistance: false })}
                />
                No
              </label>
            </div>
            {inputs.financialAssistance === true && (
              <div>
                <label className="text-sm font-semibold text-slate-300">
                  Duration of financial assistance (years) <span className="text-slate-400 text-xs">(optional)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={inputs.financialAssistanceDuration || ""}
                  onChange={(e) =>
                    handleNumberChange(e.target.value, inputs.financialAssistanceDuration || 0, (val) =>
                      updateInputs({ financialAssistanceDuration: val }),
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                  placeholder="e.g., 2"
                />
              </div>
            )}
          </section>

          {/* Household */}
          <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">4. Household</h2>
              <div className="h-px bg-slate-100" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["single", "Single"],
                  ["marriedOneIncome", "Married (one income)"],
                  ["marriedTwoIncome", "Married (two incomes)"],
                ] as Array<[HouseholdType, string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    inputs.householdType === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="householdType"
                    value={value}
                    className="hidden"
                    checked={inputs.householdType === value}
                    onChange={() => updateInputs({ householdType: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">
                Number of kids <span className="text-slate-500 text-xs">(optional)</span>
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={inputs.kids || ""}
                onChange={(e) =>
                  handleNumberChange(e.target.value, inputs.kids || 0, (val) =>
                    updateInputs({ kids: val }),
                  )
                }
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                  placeholder="e.g., 2"
              />
            </div>
          </section>

          {/* Income */}
          <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">5. Income</h2>
              <div className="h-px bg-slate-100" />
            </div>
            
            {/* Primary Income */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Primary income</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                    inputs.incomeSource === "occupation"
                      ? "border-slate-600 bg-slate-800 text-slate-50"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="incomeSource"
                    value="occupation"
                    className="hidden"
                    checked={inputs.incomeSource === "occupation"}
                    onChange={() => updateInputs({ incomeSource: "occupation" })}
                  />
                  By occupation
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                    inputs.incomeSource === "salary"
                      ? "border-slate-600 bg-slate-800 text-slate-50"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="incomeSource"
                    value="salary"
                    className="hidden"
                    checked={inputs.incomeSource === "salary"}
                    onChange={() => updateInputs({ incomeSource: "salary" })}
                  />
                  Manual salary
                </label>
              </div>
              
              {inputs.incomeSource === "occupation" && (
                <div className="relative" ref={occupationDropdownRef}>
                  <input
                    type="text"
                    value={occupationQuery}
                    onChange={(event) => {
                      setOccupationQuery(event.target.value);
                      openOccupationDropdown();
                    }}
                    onFocus={openOccupationDropdown}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setShowOccupationDropdown(false);
                      }
                    }}
                    placeholder="Search occupations"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  />
                  {selectedOccupationLabel && !showOccupationDropdown && (
                    <div className="mt-2 text-sm text-slate-600">
                      Selected: {selectedOccupationLabel}
                    </div>
                  )}
                  {showOccupationDropdown && (
                    <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-lg">
                      {filteredOccupations.length === 0 && (
                        <p className="px-3 py-2 text-sm text-slate-300">
                          No matching occupations.
                        </p>
                      )}
                      {filteredOccupations.map((occupation) => (
                        <button
                          key={occupation.value}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            updateInputs({ occupation: occupation.value });
                            setOccupationQuery(occupation.label);
                            setShowOccupationDropdown(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                            inputs.occupation === occupation.value
                              ? "bg-slate-800 text-slate-50 border border-slate-600"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <span>{occupation.label}</span>
                          {inputs.occupation === occupation.value && <span className="text-xs text-slate-600 font-medium">Selected</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {inputs.incomeSource === "salary" && (
                <input
                  type="number"
                  step="any"
                  placeholder="e.g., 75000"
                  value={inputs.salaryOverride || ""}
                  onChange={(e) =>
                    handleNumberChange(
                      e.target.value,
                      inputs.salaryOverride || 0,
                      (val) => updateInputs({ salaryOverride: val === 0 ? undefined : val }),
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                />
              )}
            </div>

            {/* Partner Income */}
            {inputs.householdType === "marriedTwoIncome" && (
              <div className="space-y-4 border-t border-slate-700 pt-6">
                <h3 className="text-sm font-semibold text-slate-300">Partner income</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                      inputs.partnerIncomeSource === "occupation"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="partnerIncomeSource"
                      value="occupation"
                      className="hidden"
                      checked={inputs.partnerIncomeSource === "occupation"}
                      onChange={() => updateInputs({ partnerIncomeSource: "occupation" })}
                    />
                    By occupation
                  </label>
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                      inputs.partnerIncomeSource === "salary"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="partnerIncomeSource"
                      value="salary"
                      className="hidden"
                      checked={inputs.partnerIncomeSource === "salary"}
                      onChange={() => updateInputs({ partnerIncomeSource: "salary" })}
                    />
                    Manual salary
                  </label>
                </div>
                
                {inputs.partnerIncomeSource === "occupation" && (
                  <div className="relative" ref={partnerOccupationDropdownRef}>
                    <input
                      type="text"
                      value={partnerOccupationQuery}
                      onChange={(event) => {
                        setPartnerOccupationQuery(event.target.value);
                        openPartnerOccupationDropdown();
                      }}
                      onFocus={openPartnerOccupationDropdown}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setShowPartnerOccupationDropdown(false);
                        }
                      }}
                      placeholder="Search partner occupations"
                      className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    />
                    {selectedPartnerOccupationLabel && !showPartnerOccupationDropdown && (
                      <div className="mt-2 text-sm text-slate-600">
                        Selected: {selectedPartnerOccupationLabel}
                      </div>
                    )}
                    {showPartnerOccupationDropdown && (
                      <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-lg">
                        {filteredPartnerOccupations.length === 0 && (
                          <p className="px-3 py-2 text-sm text-slate-300">
                            No matching occupations.
                          </p>
                        )}
                        {filteredPartnerOccupations.map((occupation) => (
                          <button
                            key={occupation.value}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              updateInputs({ partnerOccupation: occupation.value });
                              setPartnerOccupationQuery(occupation.label);
                              setShowPartnerOccupationDropdown(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                              inputs.partnerOccupation === occupation.value
                                ? "bg-slate-900 text-white"
                                : "hover:bg-slate-800 text-slate-200"
                            }`}
                          >
                            <span>{occupation.label}</span>
                            {inputs.partnerOccupation === occupation.value && <span className="text-xs text-slate-600 font-medium">Selected</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {inputs.partnerIncomeSource === "salary" && (
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g., 65000"
                    value={inputs.partnerSalaryOverride || ""}
                    onChange={(e) =>
                      handleNumberChange(
                        e.target.value,
                        inputs.partnerSalaryOverride || 0,
                        (val) => updateInputs({ partnerSalaryOverride: val === 0 ? undefined : val }),
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  />
                )}
              </div>
            )}
          </section>

          {/* Debt & Savings */}
          <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">6. Debt & Savings</h2>
              <div className="h-px bg-slate-100" />
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-300">
                  Student loan balance <span className="text-slate-400 text-xs">(optional)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={inputs.studentLoanBalance || ""}
                  onChange={(e) =>
                    handleNumberChange(e.target.value, inputs.studentLoanBalance || 0, (val) =>
                      updateInputs({ studentLoanBalance: val }),
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                  placeholder="e.g., 30000"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-300">
                  Student loan rate <span className="text-slate-400 text-xs">(optional)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={inputs.studentLoanRate ? inputs.studentLoanRate * 100 : ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? 0 : Number(e.target.value) / 100;
                    updateInputs({ studentLoanRate: val });
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                  placeholder="e.g., 6.3"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-300">
                  Savings rate (annual) <span className="text-slate-400 text-xs">(optional)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={inputs.savingsRate ? inputs.savingsRate * 100 : ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? 0 : Number(e.target.value) / 100;
                    updateInputs({ savingsRate: val });
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                  placeholder="e.g., 3.5"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-300">
                  Allocation % (of disposable income) <span className="text-slate-400 text-xs">(optional)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={inputs.allocationPercent ? inputs.allocationPercent * 100 : ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? 0 : Number(e.target.value) / 100;
                    updateInputs({ allocationPercent: Math.min(1, Math.max(0, val)) });
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                  placeholder="e.g., 80"
                />
              </div>
            </div>
          </section>

          {/* Home Preferences */}
          <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">7. Home preferences</h2>
              <div className="h-px bg-slate-100" />
            </div>
            
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["small", "Small"],
                  ["medium", "Medium"],
                  ["large", "Large"],
                  ["veryLarge", "Very Large"],
                ] as Array<[UserInputs["homeSize"], string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                    inputs.homeSize === value
                      ? "border-slate-600 bg-slate-800 text-slate-50"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="homeSize"
                    value={value}
                    className="hidden"
                    checked={inputs.homeSize === value}
                    onChange={() => updateInputs({ homeSize: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
            
            <div>
              <label className="text-sm font-semibold text-slate-900">
                Strategy mode
              </label>
              <div className="mt-2 grid gap-3 sm:grid-cols-4">
                {(
                  [
                    ["auto", "Auto"],
                    ["conservative", "Conservative"],
                    ["balanced", "Balanced"],
                    ["aggressive", "Aggressive"],
                  ] as Array<[StrategyMode, string]>
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      inputs.strategyMode === value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategyMode"
                      value={value}
                      className="hidden"
                      checked={inputs.strategyMode === value}
                      onChange={() => updateInputs({ strategyMode: value })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </section>

          {/* Personalization Section */}
          <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
            <button
              type="button"
              onClick={() => setShowPersonalization(!showPersonalization)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-slate-50">8. Personalization & Additional Information</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Have specific conditions or information we should consider?
                </p>
              </div>
              <svg
                className={`h-5 w-5 text-slate-300 transition-transform ${
                  showPersonalization ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showPersonalization && (
              <div className="space-y-4 border-t border-slate-700 pt-6">
                <div>
                  <label className="text-sm font-semibold text-slate-900 mb-2 block">
                    Specific Conditions or Personalized Information
                  </label>
                  <p className="text-xs text-slate-600 mb-3">
                    Examples: You have a job offer only in one state at the moment, you've already made progress on debt payments, etc.
                  </p>
                  <textarea
                    value={inputs.personalizationPrompt || ""}
                    onChange={(e) => updateInputs({ personalizationPrompt: e.target.value || undefined })}
                    placeholder="Tell us about any specific conditions, job offers, debt progress, or other personalized information we should consider..."
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 min-h-[120px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    rows={5}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Advanced / Optional Inputs */}
          <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-slate-50">9. Advanced settings</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Optional inputs for future planning and detailed assumptions
                </p>
              </div>
              <svg
                className={`h-5 w-5 text-slate-300 transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showAdvanced && (
              <div className="space-y-8 border-t border-slate-100 pt-6">
                {/* Future Household Changes */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300">
                    Future household changes
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-slate-800">
                        Do you plan to have children?
                      </label>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <label
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                            inputs.advanced.futureKids === true
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <input
                            type="radio"
                            name="futureKids"
                            value="yes"
                            className="hidden"
                            checked={inputs.advanced.futureKids === true}
                            onChange={() =>
                              updateAdvanced({ futureKids: true })
                            }
                          />
                          Yes
                        </label>
                        <label
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                            inputs.advanced.futureKids === false
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <input
                            type="radio"
                            name="futureKids"
                            value="no"
                            className="hidden"
                            checked={inputs.advanced.futureKids === false}
                            onChange={() =>
                              updateAdvanced({ futureKids: false })
                            }
                          />
                          No
                        </label>
                      </div>
                    </div>

                    {inputs.advanced.futureKids && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-sm font-semibold text-slate-300">
                            First child age <span className="text-slate-500 text-xs">(optional)</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="e.g., 28"
                            value={inputs.advanced.firstChildAge || ""}
                            onChange={(e) =>
                              updateAdvanced({
                                firstChildAge:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-300">
                            Second child age <span className="text-slate-400 text-xs">(optional)</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="e.g., 30"
                            value={inputs.advanced.secondChildAge || ""}
                            onChange={(e) =>
                              updateAdvanced({
                                secondChildAge:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Partner Timing (only if single) */}
                {inputs.householdType === "single" && (
                  <div className="space-y-4 border-t border-slate-700 pt-6">
                    <h3 className="text-sm font-semibold text-slate-300">
                      Partner timing
                    </h3>
                    <div>
                      <label className="text-sm font-medium text-slate-300">
                        Do you expect a financially merged partner later? <span className="text-slate-400 text-xs">(optional)</span>
                      </label>
                      <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        {(
                          [
                            ["yes", "Yes"],
                            ["no", "No"],
                            ["already", "I Already Have One"],
                          ] as Array<["yes" | "no" | "already", string]>
                        ).map(([value, label]) => (
                          <label
                            key={value}
                            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                              inputs.advanced.partnerTiming === value
                                ? "border-slate-600 bg-slate-800 text-slate-50"
                                : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                            }`}
                          >
                            <input
                              type="radio"
                              name="partnerTiming"
                              value={value}
                              className="hidden"
                              checked={inputs.advanced.partnerTiming === value}
                              onChange={() =>
                                updateAdvanced({
                                  partnerTiming: value,
                                  partnerAge:
                                    value === "yes"
                                      ? inputs.advanced.partnerAge || inputs.age
                                      : undefined,
                                })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      {inputs.advanced.partnerTiming === "yes" && (
                        <div className="mt-4">
                          <label className="text-sm font-semibold text-slate-300">
                            Expected age when partner joins <span className="text-slate-500 text-xs">(optional)</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder={`e.g., ${inputs.age || 30} (your current age)`}
                            value={inputs.advanced.partnerAge || ""}
                            onChange={(e) =>
                              updateAdvanced({
                                partnerAge:
                                  e.target.value === ""
                                    ? inputs.age || undefined
                                    : Number(e.target.value),
                              })
                            }
                            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Credit Card Debt (Additional Information) */}
                <div className="space-y-4 border-t border-slate-700 pt-6">
                  <h3 className="text-sm font-semibold text-slate-300">
                    Credit Card Debt (Additional Information)
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-semibold text-slate-300">
                        Credit card balance <span className="text-slate-500 text-xs">(optional)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="e.g., 5000"
                        value={inputs.creditCardBalance || ""}
                        onChange={(e) =>
                          handleNumberChange(e.target.value, inputs.creditCardBalance || 0, (val) =>
                            updateInputs({ creditCardBalance: val }),
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-300">
                        Credit card APR <span className="text-slate-400 text-xs">(optional)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={inputs.creditCardApr ? inputs.creditCardApr * 100 : ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Number(e.target.value) / 100;
                          updateInputs({ creditCardApr: val });
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                        placeholder="e.g., 21.6"
                      />
                    </div>
                  </div>
                </div>

                {/* Debt Behavior Assumptions */}
                <div className="space-y-4 border-t border-slate-700 pt-6">
                  <h3 className="text-sm font-semibold text-slate-300">
                    Debt behavior assumptions
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-semibold text-slate-300">
                        Estimate Annual Credit Card Debt Value <span className="text-slate-500 text-xs">(optional)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="e.g., 2000"
                        value={inputs.advanced.annualCreditCardDebt || ""}
                        onChange={(e) =>
                          updateAdvanced({
                            annualCreditCardDebt:
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value),
                          })
                        }
                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-300">
                        Student loan repayment style <span className="text-slate-400 text-xs">(optional)</span>
                      </label>
                      <div className="mt-2 grid gap-2">
                        {(
                          [
                            ["standard", "Standard amortization"],
                            ["accelerated", "Accelerated payoff"],
                            ["unsure", "Not Sure"],
                          ] as Array<
                            ["standard" | "accelerated" | "unsure", string]
                          >
                        ).map(([value, label]) => (
                          <label
                            key={value}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-400 ${
                              inputs.advanced.studentLoanStyle === value
                                ? "border-slate-600 bg-slate-800 text-slate-50"
                                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            <input
                              type="radio"
                              name="studentLoanStyle"
                              value={value}
                              className="hidden"
                              checked={
                                inputs.advanced.studentLoanStyle === value
                              }
                              onChange={() =>
                                updateAdvanced({ studentLoanStyle: value })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Savings Assumptions */}
                <div className="space-y-4 border-t border-slate-700 pt-6">
                  <h3 className="text-sm font-semibold text-slate-300">
                    Savings assumptions
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-1">
                    <div>
                      <label className="text-sm font-semibold text-slate-300">
                        Savings account interest rate (annual) <span className="text-slate-500 text-xs">(optional)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={inputs.savingsRate ? inputs.savingsRate * 100 : ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Number(e.target.value) / 100;
                          updateInputs({ savingsRate: val });
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
                        placeholder="e.g., 3.5"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {formError && (
            <div className="rounded-lg border border-rose-700 bg-rose-950 p-4 text-sm text-rose-400 leading-relaxed">
              {formError}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-5 py-3 text-base font-semibold text-slate-50 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
          >
            Calculate Affordability
          </button>
        </form>
      </main>
    </div>
  );
}
