import * as chatbotData from './chatbot/data.js';
import ChatbotScene, { headerLabel as chatbotHeaderLabel, Terminal as chatbotTerminal } from './chatbot/Scene.jsx';
import * as batchData from './batch/data.js';
import BatchScene, { headerLabel as batchHeaderLabel, Terminal as batchTerminal } from './batch/Scene.jsx';
import * as trainingData from './training/data.js';
import TrainingScene, { headerLabel as trainingHeaderLabel, Terminal as trainingTerminal } from './training/Scene.jsx';
import * as redologData from './redolog/data.js';
import RedologScene, { headerLabel as redologHeaderLabel, Terminal as redologTerminal } from './redolog/Scene.jsx';
import * as noisyneighborData from './noisyneighbor/data.js';
import NoisyNeighborScene, { headerLabel as noisyneighborHeaderLabel, Terminal as noisyneighborTerminal } from './noisyneighbor/Scene.jsx';
import * as cpuinferData from './cpuinfer/data.js';
import CpuInferScene, { headerLabel as cpuinferHeaderLabel, Terminal as cpuinferTerminal } from './cpuinfer/Scene.jsx';
import * as cipipelineData from './cipipeline/data.js';
import CiPipelineScene, { headerLabel as cipipelineHeaderLabel, Terminal as cipipelineTerminal } from './cipipeline/Scene.jsx';
import * as agenticData from './agentic/data.js';
import AgenticScene, { headerLabel as agenticHeaderLabel, Terminal as agenticTerminal } from './agentic/Scene.jsx';
import * as researchData from './research/data.js';
import ResearchScene, { headerLabel as researchHeaderLabel, Terminal as researchTerminal } from './research/Scene.jsx';

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
  noisyneighbor: {
    ...noisyneighborData,
    Scene: NoisyNeighborScene,
    headerLabel: noisyneighborHeaderLabel,
    Terminal: noisyneighborTerminal,
  },
  cpuinfer: {
    ...cpuinferData,
    Scene: CpuInferScene,
    headerLabel: cpuinferHeaderLabel,
    Terminal: cpuinferTerminal,
  },
  cipipeline: {
    ...cipipelineData,
    Scene: CiPipelineScene,
    headerLabel: cipipelineHeaderLabel,
    Terminal: cipipelineTerminal,
  },
  agentic: {
    ...agenticData,
    Scene: AgenticScene,
    headerLabel: agenticHeaderLabel,
    Terminal: agenticTerminal,
  },
  research: {
    ...researchData,
    Scene: ResearchScene,
    headerLabel: researchHeaderLabel,
    Terminal: researchTerminal,
  },
};

export const WORKLOAD_LIST = Object.values(WORKLOADS);
export const DEFAULT_WORKLOAD_ID = 'chatbot';
