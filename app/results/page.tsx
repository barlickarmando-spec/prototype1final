"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  calculateAffordability,
  type UserInputs,
  type StateResult,
} from "../../lib/affordability";

export default function ResultsPage() {
  const router = useRouter();
  const [inputs, setInputs] = useState<UserInputs | null>(null);
  const [results, setResults] = useState<StateResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("affordability-inputs");
      if (!stored) {
        setLoading(false);
        return;
      }

      const parsed: UserInputs = JSON.parse(stored);
      setInputs(parsed);

      // Calculate results
      const calculated = calculateAffordability(parsed);
      setResults(calculated);
    } catch (error) {
      console.error("Error loading or calculating results:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate rankings and suggestions
  const { topBest, topSafest, worstFit, suggestionsByState } = useMemo(() => {
    if (results.length === 0) {
      return { topBest: [], topSafest: [], worstFit: [], suggestionsByState: new Map() };
    }

    // Top 3 most viable (highest viability rating)
    const topBest = [...results]
      .sort((a, b) => b.viabilityRating - a.viabilityRating)
      .slice(0, 3);

    // Top 3 safest (highest savings %)
    const topSafest = [...results]
      .sort((a, b) => b.savingsPercent - a.savingsPercent)
      .slice(0, 3);

    // Worst fit (no viable path or barely viable)
    const worstFit = results
      .filter(
        (r) =>
          r.classification === "No viable path" ||
          r.classification === "Viable only when renting"
      )
      .slice(0, 3);

    // Generate suggestions for each state
    const suggestionsByState = new Map<string, string[]>();
    results.forEach((result) => {
      const suggestions: string[] = [];
      const state = result.stateAbbr || result.state;

      if (result.disposableIncome <= 0) {
        suggestions.push(
          `Consider renting for several years until income increases or costs decrease.`
        );
        suggestions.push(`Lower your home size preference to reduce down payment requirements.`);
      }

      if (result.yearsToHome === null && result.disposableIncome > 0) {
        suggestions.push(
          `Increase your allocation percentage above ${(result.minDebtPercent * 100).toFixed(1)}% to make home ownership viable.`
        );
        suggestions.push(
          `Consider a smaller home size to reduce the down payment target.`
        );
      }

      if (result.yearsToDebtFree === null && result.disposableIncome > 0) {
        suggestions.push(
          `Increase your annual debt payment percentage to at least ${(result.minDebtPercent * 100).toFixed(1)}% to pay off student loans.`
        );
      }

      if (
        result.classification === "Viable only when renting" ||
        result.classification === "Viable with extreme care"
      ) {
        suggestions.push(
          `Rent for ${result.yearsToHome ? Math.ceil(result.yearsToHome) : 5}+ years before purchasing to build savings.`
        );
        if (inputs && inputs.advanced.futureKids && inputs.kids === 0) {
          suggestions.push(
            `Consider delaying children by several years to improve financial margins.`
          );
        }
      }

      if (suggestions.length > 0) {
        suggestionsByState.set(state, suggestions);
      }
    });

    return { topBest, topSafest, worstFit, suggestionsByState };
  }, [results, inputs]);

  const toggleExpand = (stateAbbr: string) => {
    const newExpanded = new Set(expandedStates);
    if (newExpanded.has(stateAbbr)) {
      newExpanded.delete(stateAbbr);
    } else {
      newExpanded.add(stateAbbr);
    }
    setExpandedStates(newExpanded);
  };

  const handleRefine = () => {
    // Store current results for refinement page
    window.localStorage.setItem("affordability-results", JSON.stringify(results));
    router.push("/refine");
  };

  // Generate actionable recommendations with apply buttons
  type Recommendation = {
    text: string;
    action?: () => void;
    actionLabel?: string;
    state?: string;
  };

  const generateActionableRecommendations = useMemo((): Recommendation[] => {
    if (!inputs || results.length === 0) return [];

    const recommendations: Recommendation[] = [];

    results.forEach((result) => {
      const stateAbbr = result.stateAbbr || result.state;

      // Increase allocation percentage
      if (result.yearsToHome === null && result.disposableIncome > 0) {
        const minRequired = (result.minDebtPercent + result.minCreditPercent) * 100;
        const currentAlloc = (inputs.allocationPercent * 100);
        const increaseBy = Math.max(5, minRequired - currentAlloc + 5);
        const newAllocation = Math.min(100, currentAlloc + increaseBy) / 100;

        recommendations.push({
          text: `For ${result.state}: Increase allocation percentage from ${currentAlloc.toFixed(1)}% to ${(newAllocation * 100).toFixed(1)}% to make home ownership viable.`,
          state: result.state,
          action: () => {
            if (!inputs) return;
            const updated = {
              ...inputs,
              allocationPercent: newAllocation,
            };
            setInputs(updated);
            window.localStorage.setItem("affordability-inputs", JSON.stringify(updated));
            const calculated = calculateAffordability(updated);
            setResults(calculated);
            window.localStorage.setItem("affordability-results", JSON.stringify(calculated));
          },
          actionLabel: "Apply this change",
        });
      }

      // Lower home size
      if (result.yearsToHome === null || (result.yearsToHome && result.yearsToHome > 15)) {
        const homeSizeOrder = ["veryLarge", "large", "medium", "small"];
        const currentIndex = homeSizeOrder.indexOf(inputs.homeSize);
        if (currentIndex > 0) {
          const smallerSize = homeSizeOrder[currentIndex - 1] as UserInputs["homeSize"];

          recommendations.push({
            text: `For ${result.state}: Consider a ${smallerSize} home instead of ${inputs.homeSize} to reduce down payment requirements.`,
            state: result.state,
            action: () => {
              if (!inputs) return;
              const updated = {
                ...inputs,
                homeSize: smallerSize,
              };
              setInputs(updated);
              window.localStorage.setItem("affordability-inputs", JSON.stringify(updated));
              const calculated = calculateAffordability(updated);
              setResults(calculated);
              window.localStorage.setItem("affordability-results", JSON.stringify(calculated));
            },
            actionLabel: "Apply this change",
          });
        }
      }

      // Increase debt payment allocation
      if (result.yearsToDebtFree === null && result.disposableIncome > 0 && inputs.studentLoanBalance > 0) {
        const minDebtPercent = result.minDebtPercent * 100;
        const currentDebtAlloc = ((inputs.allocationPercent - (result.minCreditPercent || 0)) * 100);

        if (currentDebtAlloc < minDebtPercent) {
          const increaseBy = Math.max(5, minDebtPercent - currentDebtAlloc + 5);
          const newAllocation = Math.min(100, inputs.allocationPercent * 100 + increaseBy) / 100;

          recommendations.push({
            text: `For ${result.state}: Increase allocation percentage by ${increaseBy.toFixed(1)}% (to ${(newAllocation * 100).toFixed(1)}%) to pay off debt faster.`,
            state: result.state,
            action: () => {
              if (!inputs) return;
              const updated = {
                ...inputs,
                allocationPercent: newAllocation,
              };
              setInputs(updated);
              window.localStorage.setItem("affordability-inputs", JSON.stringify(updated));
              const calculated = calculateAffordability(updated);
              setResults(calculated);
              window.localStorage.setItem("affordability-results", JSON.stringify(calculated));
            },
            actionLabel: "Apply this change",
          });
        }
      }

      // Delay children suggestion
      if (
        inputs.advanced.futureKids &&
        inputs.kids === 0 &&
        inputs.advanced.firstChildAge &&
        result.yearsToHome !== null &&
        result.yearsToHome > 0 &&
        inputs.age
      ) {
        const currentAge = inputs.age;
        const childAge = inputs.advanced.firstChildAge;
        const delayBy = Math.ceil(result.yearsToHome - (childAge - currentAge)) + 2;

        if (delayBy > 0) {
          const newChildAge = currentAge + result.yearsToHome + 2;

          recommendations.push({
            text: `For ${result.state}: Delay having children until age ${Math.round(newChildAge)} (${delayBy} years later) to secure home ownership first.`,
            state: result.state,
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
              window.localStorage.setItem("affordability-inputs", JSON.stringify(updated));
              const calculated = calculateAffordability(updated);
              setResults(calculated);
              window.localStorage.setItem("affordability-results", JSON.stringify(calculated));
            },
            actionLabel: "Apply this change",
          });
        }
      }
    });

    return recommendations;
  }, [inputs, results]);

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-900 text-white flex items-center justify-center">
        <p className="text-blue-100">Loading results...</p>
      </div>
    );
  }

  if (!inputs) {
    return (
      <div className="min-h-screen bg-blue-900 text-white">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
          <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">
              No results available
            </h1>
            <p className="text-slate-900">
              No stored inputs found. Please complete the form to see results.
            </p>
            <Link
              href="/"
              className="inline-block rounded-2xl bg-slate-900 px-6 py-3 text-base font-semibold text-white transition hover:bg-slate-800"
            >
              Go to Calculator
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-900 text-white">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="space-y-3 rounded-3xl border-2 border-blue-400 bg-gradient-to-r from-blue-600 via-white to-red-600 p-8 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white drop-shadow-md">
            Results Overview
          </p>
          <h1 className="text-4xl font-bold text-slate-900 drop-shadow-sm">
            Affordability Analysis
          </h1>
              <p className="max-w-3xl text-base text-slate-900 font-medium">
                Your results are shown below, organized by state. Review the viability
                classifications, key metrics, and recommendations to refine your plan.
              </p>
        </header>

        {/* Rankings Section */}
        {(topBest.length > 0 || topSafest.length > 0 || worstFit.length > 0) && (
          <section className="grid gap-6 sm:grid-cols-3">
            {topBest.length > 0 && (
              <div className="rounded-3xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-green-50 p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-emerald-900 mb-3">
                  🏆 Top 3 Most Viable States
                </h3>
                <ul className="space-y-2">
                  {topBest.map((result, idx) => (
                    <li key={result.stateAbbr || result.state} className="text-sm">
                      <span className="font-semibold text-emerald-900">
                        {idx + 1}. {result.state}
                      </span>
                      <span className="text-emerald-700 ml-2 font-semibold">
                        Viability Rating: {result.viabilityRating.toFixed(1)}/10
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {topSafest.length > 0 && (
              <div className="rounded-3xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-blue-900 mb-3">
                  🛡️ Top 3 Safest (Highest Savings Margin)
                </h3>
                <ul className="space-y-2">
                  {topSafest.map((result, idx) => (
                    <li key={result.stateAbbr || result.state} className="text-sm">
                      <span className="font-semibold text-blue-900">
                        {idx + 1}. {result.state}
                      </span>
                      <span className="text-blue-700 ml-2">
                        ({(result.savingsPercent * 100).toFixed(1)}% savings)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {worstFit.length > 0 && (
              <div className="rounded-3xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-orange-50 p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-red-900 mb-3">
                  ⚠️ Challenging States
                </h3>
                <ul className="space-y-2">
                  {worstFit.map((result, idx) => (
                    <li key={result.stateAbbr || result.state} className="text-sm">
                      <span className="font-semibold text-red-900">
                        {idx + 1}. {result.state}
                      </span>
                      <span className="text-red-700 ml-2 text-xs">
                        ({result.classification})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="space-y-6">
          {results.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-slate-900">No results available.</p>
            </div>
          ) : (
            results.map((result) => (
              <div
                key={result.stateAbbr || result.state}
                className="space-y-4 rounded-3xl border-2 border-slate-300 bg-gradient-to-br from-white to-slate-50 p-8 shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">
                      {result.state}
                    </h2>
                    {result.stateAbbr && (
                      <p className="text-sm text-slate-700">{result.stateAbbr}</p>
                    )}
                  </div>
                  <div
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      result.classification === "Very viable and stable"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : result.classification === "Viable"
                        ? "bg-blue-100 text-blue-800 border border-blue-200"
                        : result.classification === "Viable with a higher % allocated"
                        ? "bg-purple-100 text-purple-800 border border-purple-200"
                        : result.classification === "Viable with extreme care"
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : result.classification === "Viable only when renting"
                        ? "bg-orange-100 text-orange-800 border border-orange-200"
                        : "bg-red-100 text-red-800 border border-red-200"
                    }`}
                  >
                    {result.classification}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-sm text-slate-700">Viability Rating</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {result.viabilityRating.toFixed(1)}/10
                    </p>
                    <p className="text-xs text-slate-700 mt-1">
                      Portfolio score
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-700">Minimum Savings %</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {(result.savingsPercent * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-700 mt-1">
                      of disposable income
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-700">Annual Disposable Income</p>
                    <p className="text-lg font-semibold text-slate-900">
                      ${result.disposableIncome.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-700">Estimated Years to Buy a House</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {result.yearsToHome === null ? "N/A" : `${result.yearsToHome.toFixed(1)} years`}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-700">Typical Home Value</p>
                    <p className="text-lg font-semibold text-slate-900">
                      ${result.homeValue.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-700">Combined Household Income</p>
                    <p className="text-lg font-semibold text-slate-900">
                      ${result.combinedIncome.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-700">Years to Debt Free</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {result.yearsToDebtFree === null ? "N/A" : `${result.yearsToDebtFree.toFixed(1)} years`}
                    </p>
                  </div>
                </div>

                {/* Additional Information (Collapsible) */}
                <button
                  type="button"
                  onClick={() => toggleExpand(result.stateAbbr || result.state)}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-900 hover:text-slate-900 transition"
                >
                  <span>Additional Information</span>
                  <svg
                    className={`h-5 w-5 text-slate-700 transition-transform ${
                      expandedStates.has(result.stateAbbr || result.state)
                        ? "rotate-180"
                        : ""
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

                {expandedStates.has(result.stateAbbr || result.state) && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-700 uppercase">
                          Cost of Living (household-adjusted)
                        </p>
                        <p className="text-sm text-slate-900 mt-1">
                          ${(result.combinedIncome - result.disposableIncome).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 uppercase">
                          Mortgage Rate
                        </p>
                        <p className="text-sm text-slate-900 mt-1">
                          {(result.mortgageRate * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 uppercase">
                          Required % of Disposable Income to Stay Solvent
                        </p>
                        <p className="text-sm text-slate-900 mt-1">
                          {((result.minDebtPercent + result.minCreditPercent) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 uppercase">
                          Down Payment %
                        </p>
                        <p className="text-sm text-slate-900 mt-1">
                          {(result.downPaymentPercent * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Suggestions for Viability */}
                {suggestionsByState.has(result.stateAbbr || result.state) && (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-sm font-semibold text-slate-700 mb-2">
                      Suggestions for Viability:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-slate-900">
                      {suggestionsByState
                        .get(result.stateAbbr || result.state)
                        ?.map((suggestion: string, idx: number) => (
                          <li key={idx}>{suggestion}</li>
                        ))}
                    </ul>
                  </div>
                )}

                {result.notes.length > 0 && (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-sm font-semibold text-slate-700 mb-2">Notes:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-slate-900">
                      {result.notes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Actionable Recommendations Section */}
        {generateActionableRecommendations.length > 0 && (
          <section className="space-y-6 rounded-3xl border-2 border-white bg-white p-8 shadow-lg">
            <h2 className="text-2xl font-semibold text-slate-900">Actionable Recommendations to Improve Viability</h2>
            <p className="text-sm text-slate-700">
              Click "Apply this change" on any recommendation below to automatically update your inputs and recalculate results.
            </p>
            <div className="space-y-4">
              {generateActionableRecommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 text-red-600 font-bold">•</span>
                    <span className="text-sm text-slate-900 flex-1">{rec.text}</span>
                  </div>
                  {rec.action && (
                    <button
                      onClick={rec.action}
                      className="self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 shadow-md hover:shadow-lg"
                    >
                      {rec.actionLabel || "Apply this change"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-slate-50"
          >
            ← Back to Calculator
          </Link>
          {results.length > 0 && (
          <button
            onClick={handleRefine}
            className="rounded-2xl bg-gradient-to-r from-blue-600 to-red-600 px-6 py-3 text-base font-bold text-white transition hover:from-blue-700 hover:to-red-700 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
          >
            Refine Selection →
          </button>
          )}
        </div>
      </main>
    </div>
  );
}
