// Steps of the guided analysis, shown in each step screen's StepIndicator, and the names of its four results.
import type { ComponentKey } from '../ui';

export const ANALYSIS_STEPS = ['Bowler', 'Camera', 'Video', 'Analyse', 'Results'];

/** The four results in coach words (research names are COMPONENT[k].label). */
export const RESULT_NAME: Record<ComponentKey, string> = { c1: 'Video & tracking', c2: 'Joint angles', c3: 'Injury risk', c4: 'This week’s plan' };
