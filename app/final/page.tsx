"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  calculateAffordability,
  type UserInputs,
  type StateResult,
} from "../../lib/affordability";
import { generateStatePDF } from "../../lib/pdfGenerator";

export default function FinalPage() {
  const router = useRouter();
  const [inputs, setInputs] = useState<UserInputs | null>(null);
  const [results, setResults] = useState<StateResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [filterClassification, setFilterClassification] = useState<string>("");
  const [filterMaxYears, setFilterMaxYears] = useState<string>("");
  const [filterMinDisposable, setFilterMinDisposable] = useState<string>("");

  // Classification hierarchy (best to worst)
  const CLASSIFICATION_HIERARCHY = [
    "Very viable and stable",
    "Viable",
    "Viable with a higher % allocated",
    "Viable with extreme care",
    "Viable only when renting",
    "No viable path",
  ] as const;

  // Get all classifications at or better than the selected one
  const getClassificationsAtOrBetter = (selected: string): string[] => {
    if (!selected) return [];
    const index = CLASSIFICATION_HIERARCHY.indexOf(selected as typeof CLASSIFICATION_HIERARCHY[number]);
    if (index === -1) return [selected]; // If not in hierarchy, return as-is (defensive)
    return CLASSIFICATION_HIERARCHY.slice(0, index + 1) as string[];
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("affordability-inputs");
      const storedResults = window.localStorage.getItem("affordability-results");
      
      if (!stored) {
        setLoading(false);
        return;
      }

      const parsed: UserInputs = JSON.parse(stored);
      setInputs(parsed);

      // Load results
      if (storedResults) {
        try {
          const parsedResults: StateResult[] = JSON.parse(storedResults);
          setResults(parsedResults);
          if (parsedResults.length > 0) {
            setSelectedState(parsedResults[0].stateAbbr || parsedResults[0].state);
          }
        } catch {
          const calculated = calculateAffordability(parsed);
          setResults(calculated);
          if (calculated.length > 0) {
            setSelectedState(calculated[0].stateAbbr || calculated[0].state);
          }
        }
      } else {
        const calculated = calculateAffordability(parsed);
        setResults(calculated);
        if (calculated.length > 0) {
          setSelectedState(calculated[0].stateAbbr || calculated[0].state);
        }
      }
    } catch (error) {
      console.error("Error loading results:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Get state flag image URL (try local first, fallback to CDN)
  const getStateFlagUrl = (stateAbbr: string): string => {
    const abbrLower = stateAbbr.toLowerCase();
    // Try local assets first, fallback to CDN
    return `/flags/us-states/${abbrLower}.svg`;
  };

  // Custom styles for range slider with white background
  const sliderStyles = `
    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 8px;
      background: white;
      border-radius: 4px;
      outline: none;
    }
    
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      background: #3b82f6;
      border-radius: 50%;
      cursor: pointer;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    
    input[type="range"]::-moz-range-thumb {
      width: 20px;
      height: 20px;
      background: #3b82f6;
      border-radius: 50%;
      cursor: pointer;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    
    input[type="range"]::-webkit-slider-track {
      background: white;
      height: 8px;
      border-radius: 4px;
    }
    
    input[type="range"]::-moz-range-track {
      background: white;
      height: 8px;
      border-radius: 4px;
    }
  `;

  // Filter results to only show selected states and apply classification filter
  const filteredResults = useMemo(() => {
    let filtered = results;
    
    // Filter by selected states
    if (inputs && inputs.selectedStates && inputs.selectedStates.length > 0) {
      filtered = filtered.filter((r) => 
        inputs.selectedStates.includes(r.stateAbbr || r.state)
      );
    }
    
    // Apply classification filter (hierarchical)
    if (filterClassification) {
      const allowedClassifications = getClassificationsAtOrBetter(filterClassification);
      filtered = filtered.filter((r) => allowedClassifications.includes(r.classification));
    }
    
    // Apply max years filter
    if (filterMaxYears) {
      const maxYears = Number(filterMaxYears);
      if (!isNaN(maxYears)) {
        filtered = filtered.filter((r) => r.yearsToHome === null || r.yearsToHome <= maxYears);
      }
    }
    
    // Apply min disposable income filter
    if (filterMinDisposable) {
      const minDisposable = Number(filterMinDisposable);
      if (!isNaN(minDisposable)) {
        filtered = filtered.filter((r) => r.disposableIncome >= minDisposable);
      }
    }
    
    // Sort by viability rating (most viable first)
    return filtered.sort((a, b) => (b.viabilityRating || 0) - (a.viabilityRating || 0));
  }, [results, inputs, filterClassification, filterMaxYears, filterMinDisposable]);

  const currentResult = useMemo(() => {
    if (!selectedState || !filteredResults.length) return null;
    const found = filteredResults.find(
      (r) => (r.stateAbbr || r.state) === selectedState
    ) || filteredResults[0];
    // Ensure viabilityRating exists (for old cached results)
    if (found && found.viabilityRating === undefined) {
      found.viabilityRating = 0;
    }
    return found;
  }, [filteredResults, selectedState]);

  // Generate AI Summary
  const generateSummary = (result: StateResult | null, inputs: UserInputs | null): string[] => {
    if (!result || !inputs) return [];

    const summary: string[] = [];

    // Overall assessment
    const savingsPercent = result.savingsPercent ?? 0;
    if (result.classification === "Very viable and stable") {
      summary.push(
        `Home ownership is highly achievable in ${result.state}. Your financial plan provides strong margins with ${(savingsPercent * 100).toFixed(1)}% of disposable income available for savings.`
      );
    } else if (result.classification === "Viable") {
      summary.push(
        `Home ownership is achievable in ${result.state}, though it requires careful planning. You'll need to allocate ${(savingsPercent * 100).toFixed(1)}% of your disposable income toward savings to meet your goals.`
      );
    } else if (result.classification === "Viable with extreme care") {
      summary.push(
        `Home ownership in ${result.state} is possible but requires extreme discipline. Your margins are tight, and any unexpected expenses could derail your plan.`
      );
    } else if (result.classification === "Viable only when renting") {
      summary.push(
        `Home ownership in ${result.state} is only viable if you rent first for several years to build savings. Without renting, your disposable income cannot support both debt payments and home savings.`
      );
    } else {
      summary.push(
        `Based on current inputs, home ownership in ${result.state} is not viable. Your disposable income ($${result.disposableIncome.toLocaleString()}) is insufficient to cover cost of living, debt obligations, and home savings.`
      );
    }

    // Tradeoffs
    if (result.yearsToHome !== null && result.yearsToHome !== undefined && result.yearsToHome > 5) {
      summary.push(
        `The primary tradeoff is time: you'll need ${result.yearsToHome.toFixed(1)} years to accumulate a down payment and meet debt obligations.`
      );
    }

    if (result.disposableIncome !== undefined && result.combinedIncome !== undefined && result.disposableIncome < result.combinedIncome * 0.2) {
      summary.push(
        `Your disposable income margin is narrow ($${result.disposableIncome.toLocaleString()} annually), leaving little room for unexpected expenses or lifestyle changes.`
      );
    }

    // Where margins break
    if (result.classification !== "Very viable and stable" && result.classification !== "Viable") {
      const minDebtPercent = result.minDebtPercent ?? 0;
      const allocationPercent = inputs.allocationPercent ?? 0;
      summary.push(
        `Margins break at the intersection of debt obligations (${(minDebtPercent * 100).toFixed(1)}% of disposable income) and allocation constraints. Your current allocation of ${(allocationPercent * 100).toFixed(1)}% is barely sufficient.`
      );
    }

    return summary;
  };

  // Calculate net worth at different time points
  const calculateNetWorth = (result: StateResult | null, years: number): number => {
    if (!result || !inputs || result.yearsToHome === null) return 0;

    let netWorth = 0;
    const annualSavings = result.disposableIncome * result.savingsPercent;
    const savingsRate = inputs.savingsRate;

    for (let year = 1; year <= Math.min(years, 50); year++) {
      if (year <= result.yearsToHome) {
        // Before home purchase - saving for down payment
        netWorth = (netWorth + annualSavings) * (1 + savingsRate);
      } else {
        // After home purchase - savings go to mortgage payments
        // Simplified: assume same savings rate applies to equity building
        netWorth = netWorth * (1 + savingsRate);
      }
    }

    return netWorth;
  };

  // Generate actionable recommendations with actions
  type Recommendation = {
    text: string;
    action?: () => void;
    actionLabel?: string;
  };

  const generateRecommendations = (
    result: StateResult | null,
    inputs: UserInputs | null,
    filteredResults: StateResult[] = []
  ): Recommendation[] => {
    if (!result || !inputs) return [];

    const recommendations: Recommendation[] = [];

    if (
      inputs.advanced?.futureKids &&
      inputs.kids === 0 &&
      inputs.advanced.firstChildAge &&
      inputs.age &&
      result.yearsToHome !== null &&
      result.yearsToHome !== undefined
    ) {
      const delayYears = Math.max(
        0,
        result.yearsToHome - (inputs.advanced.firstChildAge - inputs.age)
      );
      if (delayYears > 0) {
        const newChildAge = inputs.age + result.yearsToHome;
        recommendations.push({
          text: `Delay children by ${delayYears.toFixed(0)} years (until age ${Math.round(newChildAge)}) to improve financial margins and secure home ownership first.`,
          action: () => {
            if (!inputs) return;
            const updated = {
              ...inputs,
              advanced: {
                ...inputs.advanced,
                firstChildAge: Math.round(newChildAge),
              },
            };
            setInputs(updated);
            window.localStorage.setItem(
              "affordability-inputs",
              JSON.stringify(updated)
            );
            const calculated = calculateAffordability(updated);
            setResults(calculated);
            window.localStorage.setItem(
              "affordability-results",
              JSON.stringify(calculated)
            );
          },
          actionLabel: "Apply this change",
        });
      }
    }

    const allocationPercent = inputs.allocationPercent ?? 0;
    const minDebtPercent = result.minDebtPercent ?? 0;
    const minCreditPercent = result.minCreditPercent ?? 0;
    const gap = (allocationPercent - (minDebtPercent + minCreditPercent)) * 100;
    if (gap < 10) {
      const increaseBy = Math.max(0, 10 - gap);
      const newAllocation = allocationPercent + increaseBy / 100;
      recommendations.push({
        text: `Increase your allocation percentage by ${increaseBy.toFixed(1)}% (to ${(newAllocation * 100).toFixed(1)}%) to create a safer financial buffer.`,
        action: () => {
          if (!inputs) return;
          const updated = {
            ...inputs,
            allocationPercent: Math.min(1, newAllocation),
          } as UserInputs;
          setInputs(updated);
          window.localStorage.setItem(
            "affordability-inputs",
            JSON.stringify(updated)
          );
          const calculated = calculateAffordability(updated);
          setResults(calculated);
          window.localStorage.setItem(
            "affordability-results",
            JSON.stringify(calculated)
          );
        },
        actionLabel: "Apply this change",
      });
    }

    if (
      result.classification === "Viable only when renting" ||
      (result.yearsToHome !== null && result.yearsToHome !== undefined && result.yearsToHome > 5)
    ) {
      const rentYears = Math.ceil(result.yearsToHome ?? 5);
      recommendations.push({
        text: `Rent for ${rentYears} years while building savings to improve your down payment position.`,
      });
    }

    if (result.yearsToHome !== null && result.yearsToHome !== undefined && result.yearsToHome > 10) {
      const topResult = filteredResults
        .filter((r) => r.yearsToHome !== null && r.yearsToHome !== undefined)
        .sort(
          (a, b) => (a.yearsToHome ?? Infinity) - (b.yearsToHome ?? Infinity)
        )[0];

      if (
        topResult &&
        topResult.yearsToHome !== null &&
        topResult.yearsToHome !== undefined &&
        topResult.yearsToHome < result.yearsToHome
      ) {
        recommendations.push({
          text: `Consider relocating to ${topResult.state}, where home ownership is achievable ${(result.yearsToHome - topResult.yearsToHome).toFixed(1)} years faster.`,
          action: () => {
            if (!inputs) return;
            const updated = {
              ...inputs,
              selectedStates: [topResult.stateAbbr || topResult.state],
            };
            setInputs(updated);
            window.localStorage.setItem(
              "affordability-inputs",
              JSON.stringify(updated)
            );
            const calculated = calculateAffordability(updated);
            setResults(calculated);
            window.localStorage.setItem(
              "affordability-results",
              JSON.stringify(calculated)
            );
            setSelectedState(topResult.stateAbbr || topResult.state);
          },
          actionLabel: "Switch to this state",
        });
      }
    }

    const minDebtPercentCheck = result.minDebtPercent ?? 0;
    if (minDebtPercentCheck > 0.15) {
      const increaseBy = (minDebtPercentCheck - 0.15) * 100;
      recommendations.push({
        text: `Increase your annual debt payment allocation by ${increaseBy.toFixed(1)}% to accelerate debt payoff and free up income sooner.`,
      });
    }

    return recommendations;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <p className="text-slate-300">Loading final output...</p>
      </div>
    );
  }

  if (!inputs || !currentResult) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
          <div className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-50">
              No results available
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

  const summary = generateSummary(currentResult, inputs);
  const recommendations = generateRecommendations(currentResult, inputs, filteredResults);
  const netWorth10 = calculateNetWorth(currentResult, 10);
  const netWorth20 = calculateNetWorth(currentResult, 20);

  return (
    <>
      <style>{sliderStyles}</style>
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="space-y-3 rounded-3xl border border-slate-700 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-8 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            Final Decision Output
          </p>
          <h1 className="text-4xl font-bold text-slate-50">
            Your Financial Path to Home Ownership
          </h1>
          <p className="max-w-3xl text-base text-slate-300 font-medium">
            Comprehensive analysis and actionable recommendations for achieving
            your home ownership goals.
          </p>
        </header>

        {/* Overall Summary */}
        <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
          <h2 className="text-2xl font-semibold text-slate-50">Overall Summary</h2>
          <div className="space-y-4 text-base text-slate-300 leading-relaxed">
            {(() => {
              const viableStates = filteredResults.filter(
                (r) =>
                  r.classification === "Very viable and stable" ||
                  r.classification === "Viable"
              ).length;
              const totalStates = filteredResults.length;
              const homeResults = filteredResults.filter((r) => r.yearsToHome !== null);
              const debtFreeResults = filteredResults.filter((r) => r.yearsToDebtFree !== null);
              const avgYearsToHome =
                homeResults.length > 0
                  ? homeResults.reduce((sum, r) => sum + (r.yearsToHome || 0), 0) / homeResults.length
                  : 0;
              const avgYearsToDebtFree =
                debtFreeResults.length > 0
                  ? debtFreeResults.reduce((sum, r) => sum + (r.yearsToDebtFree || 0), 0) / debtFreeResults.length
                  : 0;

              return (
                <>
                  <p>
                    Based on your financial profile, {viableStates} out of {totalStates} analyzed states show viable paths to home ownership.
                    {viableStates > 0 && homeResults.length > 0 && debtFreeResults.length > 0 && !isNaN(avgYearsToDebtFree) && !isNaN(avgYearsToHome) && Number.isFinite(avgYearsToDebtFree) && Number.isFinite(avgYearsToHome) && (
                      <> On average, you can achieve debt freedom in {avgYearsToDebtFree.toFixed(1)} years and home ownership in {avgYearsToHome.toFixed(1)} years.</>
                    )}
                  </p>
                  {viableStates === 0 && (
                    <p>
                      Your current financial situation shows no viable paths to home ownership with the selected inputs.
                      Consider adjusting your allocation percentage, home size preferences, or exploring states with lower cost of living.
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          {/* Visual Summary Charts */}
          <div className="grid gap-4 sm:grid-cols-3 mt-6">
            {/* Classification Distribution */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs font-semibold text-slate-300 uppercase mb-3">
                Viability Breakdown
              </p>
              <div className="space-y-2">
                {[
                  "Very viable and stable",
                  "Viable",
                  "Viable with a higher % allocated",
                  "Viable with extreme care",
                  "Viable only when renting",
                  "No viable path",
                ].map((classification) => {
                  const count = filteredResults.filter(
                    (r) => r.classification === classification
                  ).length;
                  const percent = (count / results.length) * 100;
                  return (
                    count > 0 && (
                      <div key={classification} className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-blue-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              classification === "Very viable and stable"
                                ? "bg-emerald-500"
                                : classification === "Viable"
                                ? "bg-blue-500"
                                : classification === "Viable with a higher % allocated"
                                ? "bg-purple-500"
                                : classification === "Viable with extreme care"
                                ? "bg-amber-500"
                                : classification === "Viable only when renting"
                                ? "bg-orange-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-300 min-w-[60px] text-right">
                          {count} ({percent.toFixed(0)}%)
                        </span>
                      </div>
                    )
                  );
                })}
              </div>
            </div>

            {/* Average Timeline */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs font-semibold text-slate-300 uppercase mb-3">
                Average Timelines
              </p>
              <div className="space-y-3">
                {(() => {
                  const debtFreeResults = filteredResults.filter((r) => r.yearsToDebtFree !== null && r.yearsToDebtFree !== undefined);
                  const homeResults = filteredResults.filter((r) => r.yearsToHome !== null && r.yearsToHome !== undefined);
                  
                  const avgDebtFree =
                    debtFreeResults.length > 0
                      ? debtFreeResults.reduce((sum, r) => sum + (r.yearsToDebtFree || 0), 0) / debtFreeResults.length
                      : NaN;
                  const avgHome =
                    homeResults.length > 0
                      ? homeResults.reduce((sum, r) => sum + (r.yearsToHome || 0), 0) / homeResults.length
                      : NaN;

                  return (
                    <>
                      {!isNaN(avgDebtFree) && Number.isFinite(avgDebtFree) && (
                        <div>
                          <p className="text-xs text-slate-300 mb-1">Debt-Free</p>
                          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{
                                width: `${Math.min(100, (avgDebtFree / 20) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="text-sm font-semibold text-slate-50 mt-1">
                            {avgDebtFree.toFixed(1)} years
                          </p>
                        </div>
                      )}
                      {!isNaN(avgHome) && Number.isFinite(avgHome) && (
                        <div>
                          <p className="text-xs text-slate-300 mb-1">Home Ownership</p>
                          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500"
                              style={{
                                width: `${Math.min(100, (avgHome / 30) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="text-sm font-semibold text-slate-50 mt-1">
                            {avgHome.toFixed(1)} years
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Top States */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs font-semibold text-slate-300 uppercase mb-3">
                Top 3 Most Viable States
              </p>
              <div className="space-y-2">
                {filteredResults
                  .sort((a, b) => (b.viabilityRating || 0) - (a.viabilityRating || 0))
                  .slice(0, 3)
                  .map((result, idx) => (
                    <div
                      key={result.stateAbbr || result.state}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-semibold text-slate-200">
                        {idx + 1}. {result.state}
                      </span>
                      <span className="text-slate-200 font-bold bg-slate-700 border border-slate-600 px-2 py-1 rounded">
                        {(result.viabilityRating || 0).toFixed(1)}/10
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>

        {/* Filter Controls */}
        <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
          <h2 className="text-xl font-semibold text-slate-50">Filter Results</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-300 mb-2 block">
                Classification
              </label>
              <select
                value={filterClassification}
                onChange={(e) => setFilterClassification(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder:text-slate-500"
              >
                <option value="">All Classifications</option>
                <option value="Very viable and stable">Very viable and stable</option>
                <option value="Viable">Viable</option>
                <option value="Viable with a higher % allocated">Viable with a higher % allocated</option>
                <option value="Viable with extreme care">Viable with extreme care</option>
                <option value="Viable only when renting">Viable only when renting</option>
                <option value="No viable path">No viable path</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-300 mb-2 block">
                Max Years to Home
              </label>
              <input
                type="number"
                value={filterMaxYears}
                onChange={(e) => setFilterMaxYears(e.target.value)}
                placeholder="e.g., 10"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-300 mb-2 block">
                Min Disposable Income ($)
              </label>
              <input
                type="number"
                value={filterMinDisposable}
                onChange={(e) => setFilterMinDisposable(e.target.value)}
                placeholder="e.g., 10000"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder:text-slate-500"
              />
            </div>
          </div>
          {(filterClassification || filterMaxYears || filterMinDisposable) && (
            <button
              type="button"
              onClick={() => {
                setFilterClassification("");
                setFilterMaxYears("");
                setFilterMinDisposable("");
              }}
              className="text-sm text-slate-300 hover:text-slate-100 font-semibold"
            >
              Clear Filters
            </button>
          )}
        </section>

        {/* State Slider Selector */}
        {filteredResults.length > 1 && (
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-lg">
            <label className="text-sm font-semibold text-slate-300 mb-4 block">
              Browse States (Use Slider):
            </label>
            {/* State Flags Preview */}
            <div className="mb-4 flex items-center justify-center gap-2 overflow-x-auto pb-2">
              {filteredResults.map((result, idx) => {
                const isSelected = (result.stateAbbr || result.state) === selectedState;
                return (
                  <button
                    key={result.stateAbbr || result.state}
                    type="button"
                    onClick={() => setSelectedState(result.stateAbbr || result.state)}
                    className={`flex flex-col items-center gap-1 rounded-lg p-2 transition ${
                      isSelected
                        ? "bg-slate-800 ring-2 ring-slate-600 border border-slate-600"
                        : "hover:bg-slate-800"
                    }`}
                  >
                    <img
                      src={getStateFlagUrl(result.stateAbbr || result.state)}
                      alt={`Flag of ${result.state}`}
                      className="h-8 w-auto border border-gray-200 rounded flex-shrink-0"
                      onError={(e) => {
                        // Fallback to CDN if local asset not found
                        const img = e.target as HTMLImageElement;
                        const abbrLower = (result.stateAbbr || result.state).toLowerCase();
                        img.src = `https://cdn.jsdelivr.net/gh/jonathanleeper/state-flags@latest/svg/${abbrLower}.svg`;
                        img.onerror = () => {
                          img.style.display = "none";
                        };
                      }}
                    />
                    <span className="text-xs font-medium text-slate-300">
                      {result.stateAbbr}
                    </span>
                  </button>
                );
              })}
            </div>
            <input
              type="range"
              min="0"
              max={filteredResults.length - 1}
              step="1"
              value={filteredResults.findIndex((r) => (r.stateAbbr || r.state) === selectedState) >= 0 
                ? filteredResults.findIndex((r) => (r.stateAbbr || r.state) === selectedState)
                : 0}
              onChange={(e) => {
                const index = Number(e.target.value);
                setSelectedState(filteredResults[index]?.stateAbbr || filteredResults[index]?.state || null);
              }}
              className="w-full h-3 bg-slate-800 border-2 border-slate-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: "#1e293b",
                WebkitAppearance: "none",
                appearance: "none",
              }}
            />
            <div className="flex justify-between text-xs text-slate-300 mt-2">
              <span>First</span>
              <span className="font-semibold">
                {(filteredResults.findIndex((r) => (r.stateAbbr || r.state) === selectedState) >= 0 
                  ? filteredResults.findIndex((r) => (r.stateAbbr || r.state) === selectedState)
                  : 0) + 1} / {filteredResults.length}
              </span>
              <span>Last</span>
            </div>
            {currentResult && (
              <div className="mt-4 p-4 rounded-xl bg-slate-800 border border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={getStateFlagUrl(currentResult.stateAbbr || currentResult.state)}
                      alt={`Flag of ${currentResult.state}`}
                      className="h-12 w-auto border-2 border-gray-300 rounded flex-shrink-0"
                      onError={(e) => {
                        // Fallback to CDN if local asset not found
                        const img = e.target as HTMLImageElement;
                        const abbrLower = (currentResult.stateAbbr || currentResult.state).toLowerCase();
                        img.src = `https://cdn.jsdelivr.net/gh/jonathanleeper/state-flags@latest/svg/${abbrLower}.svg`;
                        img.onerror = () => {
                          img.style.display = "none";
                        };
                      }}
                    />
                    <div>
                      <h3 className="text-lg font-semibold text-slate-50">
                        {currentResult.state}
                      </h3>
                      <p className="text-xs text-slate-400">{currentResult.stateAbbr}</p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      currentResult.classification === "Very viable and stable"
                        ? "bg-emerald-950 text-emerald-400"
                        : currentResult.classification === "Viable"
                        ? "bg-green-950 text-green-400"
                        : currentResult.classification === "Viable with a higher % allocated"
                        ? "bg-amber-950 text-amber-400"
                        : currentResult.classification === "Viable with extreme care"
                        ? "bg-amber-950 text-amber-400"
                        : currentResult.classification === "Viable only when renting"
                        ? "bg-amber-950 text-amber-400"
                        : "bg-rose-950 text-rose-400"
                    }`}
                  >
                    {currentResult.classification}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Summary */}
        <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
          <h2 className="text-2xl font-semibold text-slate-50">Summary</h2>
          <div className="space-y-4 text-base text-slate-300 leading-relaxed">
            {summary.map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>
        </section>

        {/* Timelines */}
        <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
          <h2 className="text-2xl font-semibold text-slate-50">Timeline</h2>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                <p className="text-sm font-semibold text-slate-400 uppercase mb-2">
                  Years to Debt-Free
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {currentResult.yearsToDebtFree === null || currentResult.yearsToDebtFree === undefined
                    ? "N/A"
                    : `${currentResult.yearsToDebtFree.toFixed(1)} years`}
                </p>
                {currentResult.yearsToDebtFree !== null && currentResult.yearsToDebtFree !== undefined && (
                  <p className="text-xs text-slate-400 mt-1">
                    Age: {Math.round((inputs.age || 0) + currentResult.yearsToDebtFree)}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                <p className="text-sm font-semibold text-slate-400 uppercase mb-2">
                  Years to Down Payment
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {currentResult.yearsToHome === null || currentResult.yearsToHome === undefined
                    ? "N/A"
                    : `${currentResult.yearsToHome.toFixed(1)} years`}
                </p>
                {currentResult.yearsToHome !== null && currentResult.yearsToHome !== undefined && (
                  <p className="text-xs text-slate-400 mt-1">
                    Age: {Math.round((inputs.age || 0) + currentResult.yearsToHome)}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                <p className="text-sm font-semibold text-slate-400 uppercase mb-2">
                  Age at Mortgage
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {currentResult.yearsToHome === null || currentResult.yearsToHome === undefined
                    ? "N/A"
                    : `${Math.round((inputs.age || 0) + currentResult.yearsToHome)} years old`}
                </p>
              </div>
            </div>

            {/* Key Inflection Points */}
            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-lg font-semibold text-slate-300 mb-3">
                Key Inflection Points
              </h3>
              <ul className="space-y-2 text-sm text-slate-300">
                {currentResult.yearsToDebtFree !== null && currentResult.yearsToDebtFree !== undefined && (
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">
                      Age {Math.round((inputs.age || 0) + currentResult.yearsToDebtFree)} (Year {currentResult.yearsToDebtFree.toFixed(1)}):
                    </span>
                    <span>Debt-free milestone reached</span>
                  </li>
                )}
                {currentResult.yearsToHome !== null && currentResult.yearsToHome !== undefined && (
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">
                      Age {Math.round((inputs.age || 0) + currentResult.yearsToHome)} (Year {currentResult.yearsToHome.toFixed(1)}):
                    </span>
                    <span>Down payment saved, mortgage obtained</span>
                  </li>
                )}
                {inputs.advanced?.futureKids &&
                  inputs.advanced.firstChildAge && (
                    <li className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">
                        Age {inputs.advanced.firstChildAge}:
                      </span>
                      <span>First child arrives (cost of living increases)</span>
                    </li>
                  )}
                {inputs.advanced?.partnerTiming === "yes" &&
                  inputs.advanced.partnerAge && (
                    <li className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">
                        Age {inputs.advanced.partnerAge}:
                      </span>
                      <span>Partner joins household (income increases)</span>
                    </li>
                  )}
              </ul>
            </div>
          </div>
        </section>

        {/* Long-term Wealth Comparison */}
        <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
          <h2 className="text-2xl font-semibold text-slate-50">Long-term Wealth Projection</h2>
          <p className="text-sm text-slate-300">
            Estimated net worth at different time points (simplified calculation based
            on savings growth).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <p className="text-sm font-semibold text-slate-300 uppercase mb-2">
                Net Worth at 10 Years
              </p>
              <p className="text-3xl font-bold text-slate-50">
                ${netWorth10.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <p className="text-sm font-semibold text-slate-300 uppercase mb-2">
                Net Worth at 20 Years
              </p>
              <p className="text-3xl font-bold text-slate-50">
                ${netWorth20.toLocaleString()}
              </p>
            </div>
          </div>
        </section>

        {/* Actionable Recommendations */}
        {recommendations.length > 0 && (
          <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
            <h2 className="text-2xl font-semibold text-slate-50">Actionable Recommendations</h2>
            <p className="text-sm text-slate-300">
              Click "Apply this change" on any recommendation to automatically update your inputs and recalculate results.
            </p>
            <ul className="space-y-3">
              {recommendations.map((rec, idx) => (
                <li
                  key={idx}
                  className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 text-slate-400">•</span>
                    <span className="text-sm text-slate-200 flex-1">{rec.text}</span>
                  </div>
                  {rec.action && (
                    <button
                      onClick={rec.action}
                      className="self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 shadow-md hover:shadow-lg"
                    >
                      {rec.actionLabel || "Apply this change"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* PDF Download Section - Only for Selected State */}
        {currentResult && (
          <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
            <div>
              <h2 className="text-2xl font-semibold text-slate-50 mb-2">
                Download Financial Plan PDF
              </h2>
              <p className="text-sm text-slate-300">
                Download a comprehensive PDF report for {currentResult.state}, including year-by-year allocation breakdowns, 
                maximum viable home values, suggested improvements, and detailed financial timelines.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-50">{currentResult.state}</h3>
                <span className="text-xs font-bold text-slate-200 bg-slate-700 border border-slate-600 px-2 py-1 rounded">
                  {(currentResult.viabilityRating || 0).toFixed(1)}/10
                </span>
              </div>
              <button
                onClick={async () => {
                  if (inputs && currentResult) {
                    // Get all recommendations that mention this state
                    const stateRecommendations = recommendations.filter((rec: any) => 
                      rec.text.includes(currentResult.state) || rec.state === currentResult.state
                    );
                    // Also generate state-specific recommendations
                    const stateRecs = generateRecommendations(currentResult, inputs, filteredResults);
                    const allRecs = [...stateRecommendations, ...stateRecs];
                    await generateStatePDF(currentResult, inputs, allRecs);
                  }
                }}
                className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 shadow-md hover:shadow-lg"
              >
                Download PDF for {currentResult.state} →
              </button>
            </div>
          </section>
        )}

        <div className="flex gap-4 justify-center">
          <Link
            href="/refine"
            className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-3 text-base font-bold text-slate-200 transition hover:bg-slate-800 shadow-lg"
          >
            ← Back to Refinement
          </Link>
          <Link
            href="/"
            className="rounded-2xl bg-red-600 px-6 py-3 text-base font-bold text-white transition hover:bg-red-700 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
          >
            Start Over
          </Link>
        </div>
      </main>
      </div>
    </>
  );
}
