// Display preferences the design system reads. Research mode shows C1–C4 codes, owners and technical
// values (ICC, SHAP, rule ids); coach mode keeps plain words. Provided by the app shell (AppContext).
import { createContext, useContext } from 'react';

export const ResearchModeContext = createContext(false);
export const useResearchMode = () => useContext(ResearchModeContext);
