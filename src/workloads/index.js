import * as chatbotData from './chatbot/data.js';
import ChatbotScene, { headerLabel as chatbotHeaderLabel } from './chatbot/Scene.jsx';

/* The registry is the one place that has to know a new workload exists.
 * To add one (AI or not — SAP HANA buffer-cache thrash, Oracle redo-log
 * write pressure, whatever): add src/workloads/<name>/{data.js,Scene.jsx}
 * implementing the contract in src/engine/workloadContract.js, then add
 * an entry below. The engine and every other workload stay untouched. */
export const WORKLOADS = {
  chatbot: {
    ...chatbotData,
    Scene: ChatbotScene,
    headerLabel: chatbotHeaderLabel,
  },
};

export const WORKLOAD_LIST = Object.values(WORKLOADS);
export const DEFAULT_WORKLOAD_ID = 'chatbot';
