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

  const states = useMemo(() => getStates(), []);
  const occupations = useMemo(() => getOccupations(), []);

  // Get state flag image URL
  const getStateFlagUrl = (stateAbbr: string): string => {
    const abbrLower = stateAbbr.toLowerCase();
    // Using GitHub CDN for US state flags
    return `https://cdn.jsdelivr.net/gh/jonathanleeper/state-flags@latest/svg/${abbrLower}.svg`;
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
    <div className="min-h-screen bg-blue-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="space-y-3 rounded-3xl border-2 border-blue-400 bg-gradient-to-r from-blue-600 via-white to-red-600 p-8 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white drop-shadow-md">
            Affordability Prototype
          </p>
          <h1 className="text-4xl font-bold text-white drop-shadow-sm">
            Estimate your path to home ownership and debt freedom
          </h1>
          <p className="max-w-3xl text-base text-blue-100 font-medium">
            Start with the core inputs below. After submitting, you will see a
            state-by-state overview, then refine your selections and generate a
            final decision-grade summary.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-12">
          {/* Location Certainty */}
          <section className="space-y-6 rounded-3xl border-2 border-blue-300 bg-gradient-to-br from-white to-blue-50 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">1. Location certainty</h2>
              <p className="text-sm text-slate-900">
                Choose how specific you are about where you want to live.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["sure", "I know exactly where I want to live"],
                  ["deciding", "I'm deciding between a few places"],
                  ["unknown", "I have no idea (analyze all states)"],
                ] as Array<[LocationCertainty, string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    inputs.locationCertainty === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-900"
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
                  placeholder="Search states"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900"
                  disabled={inputs.locationCertainty === "unknown"}
                />
                {showStateDropdown && inputs.locationCertainty !== "unknown" && (
                  <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                    {filteredStates.length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-900">
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
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                            selected
                              ? "bg-blue-100 text-blue-900 border-2 border-blue-500"
                              : "hover:bg-slate-100 text-slate-900"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <img
                              src={getStateFlagUrl(state.value)}
                              alt={`${state.label} flag`}
                              className="h-5 w-auto border border-gray-200 rounded"
                              onError={(e) => {
                                // Fallback if image fails to load - hide the image
                                const img = e.target as HTMLImageElement;
                                img.style.display = "none";
                              }}
                            />
                            <span>{state.label}</span>
                          </span>
                          {selected && <span>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {inputs.selectedStates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {inputs.selectedStates.map((abbr) => {
                    const state = states.find((s) => s.value === abbr);
                    return (
                      <span
                        key={abbr}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-sm text-slate-900"
                      >
                        {state?.label}
                        <button
                          type="button"
                          onClick={() => handleStateToggle(abbr)}
                          className="text-slate-900 hover:text-slate-900"
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

          {/* Age Input */}
          <section className="space-y-6 rounded-3xl border-2 border-red-300 bg-gradient-to-br from-white to-red-50 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">2. Your Age</h2>
              <p className="text-sm text-slate-900">
                Enter your current age to see when you'll reach key milestones.
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">
                Current age
              </label>
              <input
                type="number"
                step="any"
                min="0"
                max="100"
                value={inputs.age}
                onChange={(e) =>
                  handleNumberChange(e.target.value, inputs.age, (val) =>
                    updateInputs({ age: Math.max(0, Math.min(100, val)) }),
                  )
                }
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900"
                placeholder="25"
              />
            </div>
          </section>

          {/* Household */}
          <section className="space-y-6 rounded-3xl border-2 border-blue-300 bg-gradient-to-br from-white to-blue-50 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">3. Household</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
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
                      : "border-slate-200 bg-white text-slate-900"
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
                Number of kids <span className="text-slate-400 text-xs">(optional)</span>
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
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                  placeholder="e.g., 2"
              />
            </div>
          </section>

          {/* Income */}
          <section className="space-y-6 rounded-3xl border-2 border-red-300 bg-gradient-to-br from-white to-red-50 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">4. Income</h2>
            </div>
            
            {/* Primary Income */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Primary income</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    inputs.incomeSource === "occupation"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-900"
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
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    inputs.incomeSource === "salary"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-900"
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
                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900"
                  />
                  {selectedOccupationLabel && !showOccupationDropdown && (
                    <div className="mt-2 text-sm text-slate-800">
                      Selected: {selectedOccupationLabel}
                    </div>
                  )}
                  {showOccupationDropdown && (
                    <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-lg">
                      {filteredOccupations.length === 0 && (
                        <p className="px-3 py-2 text-sm text-slate-900">
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
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                            inputs.occupation === occupation.value
                              ? "bg-slate-900 text-white"
                              : "hover:bg-slate-100 text-slate-900"
                          }`}
                        >
                          <span>{occupation.label}</span>
                          {inputs.occupation === occupation.value && <span>✓</span>}
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900"
                />
              )}
            </div>

            {/* Partner Income */}
            {inputs.householdType === "marriedTwoIncome" && (
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <h3 className="text-sm font-semibold text-slate-900">Partner income</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      inputs.partnerIncomeSource === "occupation"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-900"
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
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      inputs.partnerIncomeSource === "salary"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-900"
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
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900"
                    />
                    {selectedPartnerOccupationLabel && !showPartnerOccupationDropdown && (
                      <div className="mt-2 text-sm text-slate-800">
                        Selected: {selectedPartnerOccupationLabel}
                      </div>
                    )}
                    {showPartnerOccupationDropdown && (
                      <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-lg">
                        {filteredPartnerOccupations.length === 0 && (
                          <p className="px-3 py-2 text-sm text-slate-900">
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
                                : "hover:bg-slate-100 text-slate-900"
                            }`}
                          >
                            <span>{occupation.label}</span>
                            {inputs.partnerOccupation === occupation.value && <span>✓</span>}
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
                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900"
                  />
                )}
              </div>
            )}
          </section>

          {/* Debt & Savings */}
          <section className="space-y-6 rounded-3xl border-2 border-blue-300 bg-gradient-to-br from-white to-blue-50 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">5. Debt & Savings</h2>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-900">
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
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                  placeholder="e.g., 30000"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-900">
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
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                  placeholder="e.g., 6.3"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-900">
                  Credit card balance <span className="text-slate-400 text-xs">(optional)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={inputs.creditCardBalance || ""}
                  onChange={(e) =>
                    handleNumberChange(e.target.value, inputs.creditCardBalance || 0, (val) =>
                      updateInputs({ creditCardBalance: val }),
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                  placeholder="e.g., 5000"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-900">
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
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                  placeholder="e.g., 21.6"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-900">
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
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                  placeholder="e.g., 3.5"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-900">
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
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                  placeholder="e.g., 80"
                />
              </div>
            </div>
          </section>

          {/* Home Preferences */}
          <section className="space-y-6 rounded-3xl border-2 border-red-300 bg-gradient-to-br from-white to-red-50 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">6. Home preferences</h2>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
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
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    inputs.homeSize === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-900"
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
              <div className="mt-2 grid gap-4 sm:grid-cols-4">
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
                        : "border-slate-200 bg-white text-slate-900"
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

          {/* Advanced / Optional Inputs */}
          <section className="space-y-6 rounded-3xl border-2 border-blue-300 bg-gradient-to-br from-white to-blue-50 p-8 shadow-lg">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-slate-900">7. Advanced settings</h2>
                <p className="text-sm text-slate-900">
                  Optional inputs for future planning and detailed assumptions
                </p>
              </div>
              <svg
                className={`h-5 w-5 text-slate-900 transition-transform ${
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
                  <h3 className="text-sm font-semibold text-slate-900">
                    Future household changes
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-slate-800">
                        Do you plan to have children?
                      </label>
                      <div className="mt-2 grid gap-4 sm:grid-cols-2">
                        <label
                          className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                            inputs.advanced.futureKids === true
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-900"
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
                          className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                            inputs.advanced.futureKids === false
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-900"
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
                          <label className="text-sm font-semibold text-slate-900">
                            First child age <span className="text-slate-400 text-xs">(optional)</span>
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
                            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-900">
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
                            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Partner Timing (only if single) */}
                {inputs.householdType === "single" && (
                  <div className="space-y-4 border-t border-slate-100 pt-6">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Partner timing
                    </h3>
                    <div>
                      <label className="text-sm font-medium text-slate-800">
                        Do you expect a financially merged partner later? <span className="text-slate-400 text-xs">(optional)</span>
                      </label>
                      <div className="mt-2 grid gap-4 sm:grid-cols-3">
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
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-900"
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
                          <label className="text-sm font-semibold text-slate-900">
                            Expected age when partner joins <span className="text-slate-400 text-xs">(optional)</span>
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
                            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Debt Behavior Assumptions */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Debt behavior assumptions
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-semibold text-slate-900">
                        Estimate Annual Credit Card Debt Value <span className="text-slate-400 text-xs">(optional)</span>
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
                        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-900">
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
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                              inputs.advanced.studentLoanStyle === value
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-900"
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
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Savings assumptions
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-1">
                    <div>
                      <label className="text-sm font-semibold text-slate-900">
                        Savings account interest rate (annual) <span className="text-slate-400 text-xs">(optional)</span>
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
                        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                        placeholder="e.g., 3.5"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {formError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {formError}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-red-600 px-6 py-4 text-base font-bold text-white transition hover:from-blue-700 hover:to-red-700 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
          >
            Calculate Affordability
          </button>
        </form>
      </main>
    </div>
  );
}
