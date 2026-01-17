"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  calculateAffordability,
  getStates,
  type UserInputs,
  type StateResult,
  type StrategyMode,
} from "../../lib/affordability";

export default function RefinePage() {
  const router = useRouter();
  const [inputs, setInputs] = useState<UserInputs | null>(null);
  const [results, setResults] = useState<StateResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewResults, setPreviewResults] = useState<StateResult[]>([]);
  const [hasRecalculated, setHasRecalculated] = useState(false);

  const states = useMemo(() => getStates(), []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("affordability-inputs");
      
      if (!stored) {
        setLoading(false);
        return;
      }

      const parsed: UserInputs = JSON.parse(stored);
      setInputs(parsed);

      // Calculate for ALL states, not just selected ones
      // Temporarily set locationCertainty to "unknown" to get all states
      const allStatesInputs = {
        ...parsed,
        locationCertainty: "unknown" as const,
      };
      
      const calculated = calculateAffordability(allStatesInputs);
      setResults(calculated);
      setPreviewResults(calculated);
    } catch (error) {
      console.error("Error loading or calculating results:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateInputs = (patch: Partial<UserInputs>) => {
    if (!inputs) return;
    const updated = { ...inputs, ...patch };
    setInputs(updated);
    window.localStorage.setItem("affordability-inputs", JSON.stringify(updated));
    setHasRecalculated(false);
  };

  const handleRecalculate = () => {
    if (!inputs) return;
    // Recalculate for ALL states, not just selected ones
    const allStatesInputs = {
      ...inputs,
      locationCertainty: "unknown" as const,
    };
    const calculated = calculateAffordability(allStatesInputs);
    setResults(calculated);
    setPreviewResults(calculated);
    window.localStorage.setItem("affordability-results", JSON.stringify(calculated));
    setHasRecalculated(true);
  };

  const toggleState = (stateAbbr: string) => {
    if (!inputs) return;
    if (inputs.selectedStates.includes(stateAbbr)) {
      updateInputs({
        selectedStates: inputs.selectedStates.filter((s) => s !== stateAbbr),
      });
    } else {
      updateInputs({
        selectedStates: [...inputs.selectedStates, stateAbbr],
      });
    }
  };

  const getMinRequiredPercent = (result: StateResult): number => {
    return (result.minDebtPercent + result.minCreditPercent) * 100;
  };

  const getGap = (result: StateResult): number => {
    const minRequired = getMinRequiredPercent(result);
    const userAllocation = inputs ? inputs.allocationPercent * 100 : 0;
    return userAllocation - minRequired;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <p className="text-slate-300">Loading refinement options...</p>
      </div>
    );
  }

  if (!inputs) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
          <div className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-50">
              No inputs available
            </h1>
            <p className="text-slate-300">
              Please complete the calculator first.
            </p>
            <Link
              href="/"
              className="inline-block rounded-2xl bg-slate-800 border border-slate-700 px-6 py-3 text-base font-semibold text-slate-50 transition hover:bg-slate-700"
            >
              Go to Calculator
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="space-y-3 rounded-3xl border border-slate-700 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-8 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            Refine Your Selection
          </p>
          <h1 className="text-4xl font-bold text-slate-50">
            Adjust Your Financial Plan
          </h1>
          <p className="max-w-3xl text-base text-slate-300 font-medium">
            Narrow your state selection, adjust allocation percentages, modify house
            size preferences, and experiment with different strategies. Click
            "Recalculate" to see updated results.
          </p>
        </header>

        <div className="space-y-8">
          {/* Narrow States - Grouped by Viability */}
          <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">1. Narrow States</h2>
              <p className="text-sm text-slate-300">
                Select or deselect states to analyze, organized by viability classification.
              </p>
            </div>
            
            {(() => {
              // Group states by classification
              const grouped: Record<string, Array<{ state: typeof states[0]; result: StateResult | undefined }>> = {
                "Very viable and stable": [],
                "Viable": [],
                "Viable with a higher % allocated": [],
                "Viable with extreme care": [],
                "Viable only when renting": [],
                "No viable path": [],
              };

              states.forEach((state) => {
                const result = results.find((r) => r.stateAbbr === state.value);
                const classification = result?.classification || "No viable path";
                if (!grouped[classification]) grouped[classification] = [];
                grouped[classification].push({ state, result });
              });

              const classificationColors: Record<string, { bg: string; text: string; border: string }> = {
                "Very viable and stable": { bg: "bg-slate-800", text: "text-emerald-400", border: "border-slate-700" },
                "Viable": { bg: "bg-slate-800", text: "text-green-400", border: "border-slate-700" },
                "Viable with a higher % allocated": { bg: "bg-slate-800", text: "text-amber-400", border: "border-slate-700" },
                "Viable with extreme care": { bg: "bg-slate-800", text: "text-amber-400", border: "border-slate-700" },
                "Viable only when renting": { bg: "bg-slate-800", text: "text-amber-400", border: "border-slate-700" },
                "No viable path": { bg: "bg-slate-800", text: "text-rose-400", border: "border-slate-700" },
              };

              return (
                <div className="space-y-6 max-h-[600px] overflow-y-auto">
                  {Object.entries(grouped).map(([classification, stateList]) => {
                    if (stateList.length === 0) return null;
                    const colors = classificationColors[classification];
                    return (
                      <div key={classification} className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-4`}>
                        <h3 className={`text-sm font-semibold ${colors.text} mb-3 pb-2 border-b ${colors.border}`}>
                          {classification} ({stateList.length} states)
                        </h3>
                        <div className="grid gap-2">
                          {stateList.map(({ state, result }) => {
                            const selected = inputs.selectedStates.includes(state.value);
                            return (
                              <label
                                key={state.value}
                                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                                  selected
                                    ? `border-slate-600 bg-slate-800 text-slate-50`
                                    : `border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800`
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleState(state.value)}
                                  className="rounded border-slate-600 bg-slate-800"
                                />
                                <span className="flex-1">{state.label}</span>
                                {result && (
                                  <div className="ml-auto flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 px-2 py-1 rounded">
                                      {result.viabilityRating.toFixed(1)}/10
                                    </span>
                                    <span className="text-xs text-slate-400">
                                      {result.yearsToHome !== null && `${result.yearsToHome.toFixed(1)}y`}
                                      {result.yearsToDebtFree !== null && ` / ${result.yearsToDebtFree.toFixed(1)}y debt-free`}
                                    </span>
                                  </div>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>

          {/* Maximum % Allocation */}
          <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">
                2. Maximum % Willing to Allocate
              </h2>
              <p className="text-sm text-slate-300">
                Adjust the percentage of disposable income you're willing to allocate
                toward house savings and debt payments.
              </p>
            </div>

            {results.length > 0 && (
              <div className="space-y-4">
                {/* Show requirement and gap for worst case */}
                {(() => {
                  const worstResult = results.reduce((worst, current) => {
                    const worstReq = getMinRequiredPercent(worst);
                    const currentReq = getMinRequiredPercent(current);
                    return currentReq > worstReq ? current : worst;
                  }, results[0]);

                  const minRequired = getMinRequiredPercent(worstResult);
                  const userAllocation = inputs.allocationPercent * 100;
                  const gap = getGap(worstResult);

                  return (
                    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase">
                            Minimum Required
                          </p>
                          <p className="text-lg font-semibold text-slate-50">
                            {minRequired.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase">
                            Your Allocation
                          </p>
                          <p className="text-lg font-semibold text-slate-50">
                            {userAllocation.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase">
                            Gap
                          </p>
                          <p
                            className={`text-lg font-semibold ${
                              gap >= 0 ? "text-green-400" : "text-rose-400"
                            }`}
                          >
                            {gap >= 0 ? "+" : ""}
                            {gap.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-slate-300">
                    Allocation % (of disposable income)
                  </label>
                  
                  {/* Manual Input */}
                  <input
                    type="text"
                    value={Math.round(inputs.allocationPercent * 1000) / 10}
                    onChange={(e) => {
                      const value = e.target.value;
                      const parsed = Number(value);
                      if (value === "" || (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100)) {
                        updateInputs({
                          allocationPercent: value === "" ? 0 : parsed / 100,
                        });
                      }
                    }}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder:text-slate-500"
                    placeholder="80"
                  />
                  
                  {/* Slider */}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={inputs.allocationPercent * 100}
                    onChange={(e) =>
                      updateInputs({
                        allocationPercent: Number(e.target.value) / 100,
                      })
                    }
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* House Size Preference */}
          <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">3. House Size Preference</h2>
              <p className="text-sm text-slate-300">
                Select your preferred home size. Sizes are shown for all states, but
                viability may vary.
              </p>
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
          </section>

          {/* Strategy Adjustment */}
          <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">4. Strategy Adjustment</h2>
              <p className="text-sm text-slate-300">
                Switch between Conservative, Balanced, and Aggressive strategies to
                see how timelines change.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
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
                      ? "border-slate-600 bg-slate-800 text-slate-50"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
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
          </section>

          {!hasRecalculated && (
            <div className="rounded-2xl border border-amber-700 bg-amber-950 p-4 text-sm text-amber-400">
              You've made changes. Click "Recalculate" to see updated results.
            </div>
          )}
        </div>

        <div className="flex gap-4 justify-center">
          <Link
            href="/results"
            className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-3 text-base font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            ← Back to Results
          </Link>
          <button
            onClick={handleRecalculate}
            className="rounded-2xl bg-slate-800 border border-slate-700 px-6 py-3 text-base font-bold text-slate-50 transition hover:bg-slate-700 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
          >
            Recalculate
          </button>
          {hasRecalculated && (
            <button
              onClick={() => router.push("/final")}
              className="rounded-2xl bg-slate-800 border border-slate-700 px-6 py-3 text-base font-bold text-slate-50 transition hover:bg-slate-700 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              View Final Output →
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
