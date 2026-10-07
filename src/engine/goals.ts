import type { SessionConfig, SessionState } from "../types";

export function goalsSatisfied(state: SessionState, config: SessionConfig): boolean {
  const roundsOn = config.maxRoundsEnabled;
  const wordsOn = config.wordGoalEnabled;
  if (!roundsOn && !wordsOn) return false;
  const roundsMet = !roundsOn || state.roundsCompleted >= config.maxRounds;
  const wordsMet = !wordsOn || state.credit >= config.wordGoal;
  if (roundsOn && wordsOn) {
    return config.terminationOperator === "AND" ? roundsMet && wordsMet : roundsMet || wordsMet;
  }
  return roundsOn ? roundsMet : wordsMet;
}
