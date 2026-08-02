import * as chatbotData from './chatbot/data.js';
import ChatbotScene, { headerLabel as chatbotHeaderLabel, Terminal as chatbotTerminal } from './chatbot/Scene.jsx';
import * as longctxData from './longctx/data.js';
import LongctxScene, { headerLabel as longctxHeaderLabel, Terminal as longctxTerminal } from './longctx/Scene.jsx';
import * as batchData from './batch/data.js';
import BatchScene, { headerLabel as batchHeaderLabel, Terminal as batchTerminal } from './batch/Scene.jsx';
import * as trainingData from './training/data.js';
import TrainingScene, { headerLabel as trainingHeaderLabel, Terminal as trainingTerminal } from './training/Scene.jsx';
import * as redologData from './redolog/data.js';
import RedologScene, { headerLabel as redologHeaderLabel, Terminal as redologTerminal } from './redolog/Scene.jsx';

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
    Terminal: chatbotTerminal,
  },
  longctx: {
    ...longctxData,
    Scene: LongctxScene,
    headerLabel: longctxHeaderLabel,
    Terminal: longctxTerminal,
  },
  batch: {
    ...batchData,
    Scene: BatchScene,
    headerLabel: batchHeaderLabel,
    Terminal: batchTerminal,
  },
  training: {
    ...trainingData,
    Scene: TrainingScene,
    headerLabel: trainingHeaderLabel,
    Terminal: trainingTerminal,
  },
  redolog: {
    ...redologData,
    Scene: RedologScene,
    headerLabel: redologHeaderLabel,
    Terminal: redologTerminal,
  },
};

export const WORKLOAD_LIST = Object.values(WORKLOADS);
export const DEFAULT_WORKLOAD_ID = 'chatbot';
