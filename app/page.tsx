"use client";

import { useMemo, useState } from "react";
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
  age: 25,
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
  studentLoanRate: 0.063,
  creditCardBalance: 0,
  creditCardApr: 0.216,
  savingsRate: 0.03,
  allocationPercent: 0.8,
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Affordability Prototype
          </p>
          <h1 className="text-4xl font-semibold text-slate-900">
            Estimate your path to home ownership and debt freedom
          </h1>
          <p className="max-w-3xl text-base text-slate-600">
            Start with the core inputs below. After submitting, you will see a
            state-by-state overview, then refine your selections and generate a
            final decision-grade summary.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-12">
          <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">1. Location certainty</h2>
              <p className="text-sm text-slate-500">
                Choose how specific you are about where you want to live.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["sure", "I know exactly where I want to live"],
                  ["deciding", "I’m deciding between a few places"],
                  ["unknown", "I have no idea (analyze all states)"],
                ] as Array<[LocationCertainty, string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    inputs.locationCertainty === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700"
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
              <label className="text-sm font-semibold text-slate-700">
                Select state(s)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={stateQuery}
                  onChange={(event) => {
                    setStateQuery(event.target.value);
                    setShowStateDropdown(true);
                  }}
                  onFocus={() => setShowStateDropdown(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setShowStateDropdown(false);
                    }
                  }}
                  placeholder="Search states"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                />
                {showStateDropdown && (
                  <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-lg">
                    {filteredStates.length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-500">
                        No matching states.
                      </p>
                    )}
                    {filteredStates.map((state) => {
                      const selected =
                        inputs.locationCertainty === "unknown"
                          ? true
                          : inputs.selectedStates.includes(state.value);
                      return (
                        <button
                          key={state.value}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            if (inputs.locationCertainty !== "unknown") {
                              handleStateToggle(state.value);
                            }
                          }}
                          disabled={inputs.locationCertainty === "unknown"}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                            selected
                              ? "bg-slate-900 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <span>
                            {state.label} ({state.value})
                          </span>
                          {selected && <span className="text-xs">Selected</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {inputs.selectedStates.length > 0 &&
                inputs.locationCertainty !== "unknown" && (
                  <div className="flex flex-wrap gap-2">
                    {inputs.selectedStates.map((abbr) => {
                      const match = states.find((state) => state.value === abbr);
                      return (
                        <button
                          key={abbr}
                          type="button"
                          onClick={() => handleStateToggle(abbr)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
                        >
                          {match ? `${match.label} (${abbr})` : abbr} ✕
                        </button>
                      );
                    })}
                  </div>
                )}
              {inputs.locationCertainty === "unknown" && (
                <p className="text-xs text-slate-500">
                  All states will be analyzed. State selection is disabled.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">2. Household profile</h2>
              <p className="text-sm text-slate-500">
                Define your current household structure and occupations.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["single", "Single/Independent"],
                  ["marriedOneIncome", "Married/Coupled: One Income"],
                  ["marriedTwoIncome", "Married/Coupled: Two Earners"],
                ] as Array<[HouseholdType, string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    inputs.householdType === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700"
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

            <div className="grid gap-6 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-700">Current age</span>
                <input
                  type="number"
                  min={0}
                  value={inputs.age}
                  onChange={(event) =>
                    updateInputs({ age: Number(event.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-2"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-700"># of kids</span>
                <input
                  type="number"
                  min={0}
                  value={inputs.kids}
                  onChange={(event) =>
                    updateInputs({ kids: Number(event.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-2"
                />
              </label>
              <div className="space-y-4 text-sm">
                <div className="space-y-2">
                  <span className="font-semibold text-slate-700">
                    Primary income input
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {(
                      [
                        ["occupation", "Use occupation"],
                        ["salary", "Enter salary"],
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold ${
                          inputs.incomeSource === value
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 text-slate-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="incomeSource"
                          value={value}
                          className="hidden"
                          checked={inputs.incomeSource === value}
                          onChange={() => updateInputs({ incomeSource: value })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                {inputs.incomeSource === "occupation" && (
                  <label className="space-y-2 text-sm">
                    <span className="font-semibold text-slate-700">
                      Primary occupation
                    </span>
                    <div className="relative">
                      <input
                        type="text"
                        value={occupationQuery}
                        onChange={(event) => {
                          setOccupationQuery(event.target.value);
                          setShowOccupationDropdown(true);
                        }}
                        onFocus={() => setShowOccupationDropdown(true)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setShowOccupationDropdown(false);
                          }
                        }}
                        placeholder="Search occupations"
                        className="w-full rounded-xl border border-slate-200 px-4 py-2"
                      />
                      {showOccupationDropdown && (
                        <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-lg">
                          {filteredOccupations.length === 0 && (
                            <p className="px-3 py-2 text-sm text-slate-500">
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
                                setOccupationQuery(
                                  `${occupation.label} (${occupation.value})`,
                                );
                                setShowOccupationDropdown(false);
                              }}
                              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
                            >
                              <span>
                                {occupation.label} ({occupation.value})
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                )}
                {inputs.incomeSource === "salary" && (
                  <label className="space-y-2 text-sm">
                    <span className="font-semibold text-slate-700">
                      Primary salary
                    </span>
                    <input
                      type="number"
                      min={0}
                      placeholder="Enter annual salary"
                      value={inputs.salaryOverride ?? ""}
                      onChange={(event) =>
                        updateInputs({
                          salaryOverride:
                            Number(event.target.value) || undefined,
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-2"
                    />
                  </label>
                )}
              </div>
              {inputs.householdType === "marriedTwoIncome" && (
                <div className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <span className="font-semibold text-slate-700">
                      Partner income input
                    </span>
                    <div className="flex flex-wrap gap-3">
                      {(
                        [
                          ["occupation", "Use occupation"],
                          ["salary", "Enter salary"],
                        ] as const
                      ).map(([value, label]) => (
                        <label
                          key={value}
                          className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold ${
                            inputs.partnerIncomeSource === value
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 text-slate-600"
                          }`}
                        >
                          <input
                            type="radio"
                            name="partnerIncomeSource"
                            value={value}
                            className="hidden"
                            checked={inputs.partnerIncomeSource === value}
                            onChange={() =>
                              updateInputs({ partnerIncomeSource: value })
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  {inputs.partnerIncomeSource === "occupation" && (
                    <label className="space-y-2 text-sm">
                      <span className="font-semibold text-slate-700">
                        Partner occupation
                      </span>
                      <div className="relative">
                        <input
                          type="text"
                          value={partnerOccupationQuery}
                          onChange={(event) => {
                            setPartnerOccupationQuery(event.target.value);
                            setShowPartnerOccupationDropdown(true);
                          }}
                          onFocus={() => setShowPartnerOccupationDropdown(true)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setShowPartnerOccupationDropdown(false);
                            }
                          }}
                          placeholder="Search occupations"
                          className="w-full rounded-xl border border-slate-200 px-4 py-2"
                        />
                        {showPartnerOccupationDropdown && (
                          <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-lg">
                            {filteredOccupations.length === 0 && (
                              <p className="px-3 py-2 text-sm text-slate-500">
                                No matching occupations.
                              </p>
                            )}
                            {filteredOccupations.map((occupation) => (
                              <button
                                key={occupation.value}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  updateInputs({
                                    partnerOccupation: occupation.value,
                                  });
                                  setPartnerOccupationQuery(
                                    `${occupation.label} (${occupation.value})`,
                                  );
                                  setShowPartnerOccupationDropdown(false);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
                              >
                                <span>
                                  {occupation.label} ({occupation.value})
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  )}
                  {inputs.partnerIncomeSource === "salary" && (
                    <label className="space-y-2 text-sm">
                      <span className="font-semibold text-slate-700">
                        Partner salary
                      </span>
                      <input
                        type="number"
                        min={0}
                        placeholder="Enter annual salary"
                        value={inputs.partnerSalaryOverride ?? ""}
                        onChange={(event) =>
                          updateInputs({
                            partnerSalaryOverride:
                              Number(event.target.value) || undefined,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">3. Debts & strategy</h2>
              <p className="text-sm text-slate-500">
                Include current balances and how aggressively you want to move.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-700">
                  Student loan balance
                </span>
                <input
                  type="number"
                  min={0}
                  value={inputs.studentLoanBalance}
                  onChange={(event) =>
                    updateInputs({
                      studentLoanBalance: Number(event.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-2"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-700">
                  Student loan interest rate
                </span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={percentToInput(inputs.studentLoanRate)}
                  onChange={(event) =>
                    updateInputs({
                      studentLoanRate: inputToPercent(event.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-2"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-700">
                  Credit card balance
                </span>
                <input
                  type="number"
                  min={0}
                  value={inputs.creditCardBalance}
                  onChange={(event) =>
                    updateInputs({ creditCardBalance: Number(event.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-2"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-700">
                  Credit card APR
                </span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={percentToInput(inputs.creditCardApr)}
                  onChange={(event) =>
                    updateInputs({
                      creditCardApr: inputToPercent(event.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-2"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-700">
                  % of disposable income willing to allocate
                </span>
                <input
                  type="number"
                  step="1"
                  min={0}
                  max={100}
                  value={percentToInput(inputs.allocationPercent)}
                  onChange={(event) =>
                    updateInputs({
                      allocationPercent: inputToPercent(event.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-2"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              {(
                [
                  ["auto", "Auto (best)"],
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
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="strategy"
                    value={value}
                    className="hidden"
                    checked={inputs.strategyMode === value}
                    onChange={() => updateInputs({ strategyMode: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-700">
                  Savings account interest rate
                </span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={percentToInput(inputs.savingsRate)}
                  onChange={(event) =>
                    updateInputs({
                      savingsRate: inputToPercent(event.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-2"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-700">
                  Home size preference
                </span>
                <select
                  value={inputs.homeSize}
                  onChange={(event) =>
                    updateInputs({
                      homeSize: event.target.value as UserInputs["homeSize"],
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-2"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="veryLarge">Very large</option>
                </select>
              </label>
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="flex w-full items-center justify-between text-left text-base font-semibold"
            >
              Advanced settings
              <span className="text-sm text-slate-500">
                {showAdvanced ? "Hide" : "Show"}
              </span>
            </button>
            {showAdvanced && (
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={inputs.advanced.futureKids}
                    onChange={(event) =>
                      updateAdvanced({ futureKids: event.target.checked })
                    }
                  />
                  Do you plan to have children?
                </label>
                {inputs.advanced.futureKids && (
                  <div className="grid gap-4">
                    <label className="space-y-2 text-sm">
                      <span className="font-semibold text-slate-700">
                        First child year
                      </span>
                      <input
                        type="number"
                        value={inputs.advanced.firstChildAge ?? ""}
                        onChange={(event) =>
                          updateAdvanced({
                            firstChildAge: Number(event.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2"
                      />
                    </label>
                    <label className="space-y-2 text-sm">
                      <span className="font-semibold text-slate-700">
                        Second child year
                      </span>
                      <input
                        type="number"
                        value={inputs.advanced.secondChildAge ?? ""}
                        onChange={(event) =>
                          updateAdvanced({
                            secondChildAge: Number(event.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2"
                      />
                    </label>
                  </div>
                )}
                <label className="space-y-2 text-sm">
                  <span className="font-semibold text-slate-700">
                    Partner timing (if single)
                  </span>
                  <select
                    value={inputs.advanced.partnerTiming ?? ""}
                    onChange={(event) =>
                      updateAdvanced({
                        partnerTiming: event.target.value as UserInputs["advanced"]["partnerTiming"],
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-2"
                  >
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="already">I already have one</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-semibold text-slate-700">
                    Expected partner age
                  </span>
                  <input
                    type="number"
                    value={inputs.advanced.partnerAge ?? ""}
                    onChange={(event) =>
                      updateAdvanced({ partnerAge: Number(event.target.value) })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-semibold text-slate-700">
                    Estimate annual credit card debt refresh
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={inputs.advanced.annualCreditCardDebt ?? ""}
                    onChange={(event) =>
                      updateAdvanced({
                        annualCreditCardDebt: Number(event.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-semibold text-slate-700">
                    Student loan repayment style
                  </span>
                  <select
                    value={inputs.advanced.studentLoanStyle ?? ""}
                    onChange={(event) =>
                      updateAdvanced({
                        studentLoanStyle: event.target.value as UserInputs["advanced"]["studentLoanStyle"],
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-2"
                  >
                    <option value="standard">Standard amortization</option>
                    <option value="accelerated">Accelerated payoff</option>
                    <option value="unsure">Not sure</option>
                  </select>
                </label>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  Advanced inputs are saved and will be used for expanded
                  modeling in the next iteration.
                </p>
              </div>
            )}
          </section>

          <section className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h3 className="text-base font-semibold">Ready for results?</h3>
              <p className="text-sm text-slate-500">
                You will get a high-level state overview before refining.
              </p>
              {formError && (
                <p className="mt-2 text-sm font-medium text-rose-600">
                  {formError}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white"
            >
              See results
            </button>
          </section>
        </form>
      </main>
    </div>
  );
}
