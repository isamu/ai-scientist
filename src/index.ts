import fs from "fs";

import "dotenv/config";

import { idea_first_prompt, idea_reflection_prompt } from "./text";
import { getBaseDir, loadJsonFile, agents } from "./utils";

import { GraphAI } from "graphai";

const getGraphData = (maxNumGenerations: number, numReflections: number) => {
  const graphData = {
    version: 0.5,
    loop: {
      count: maxNumGenerations,
    },
    nodes: {
      idea_str_archive: {
        value: [], // array. injectValue
        update: ":nextIdeas.array",
      },
      ideaSystemPrompt: {
        value: "", // string. injectValue
      },
      taskDescription: {
        value: "", // string. injectValue
      },
      code: {
        value: "", // string. injectValue
      },
      ideaPrompt: {
        agent: "stringTemplateAgent",
        params: {
          template: idea_first_prompt,
        },
        inputs: {
          taskDescription: ":taskDescription",
          code: ":code",
          numReflections,
          prev_ideas_string: ":idea_str_archive.join(,)",
        },
        // isResult: true,
      },
      task1: {
        agent: "openAIAgent",
        params: {
          prompt: ":ideaPrompt",
          system: ":ideaSystemPrompt",
        },
      },
      jsonParse: {
        agent: "jsonParserAgent", // just for data validate
        inputs: { text: ":task1.text" },
        // isResult: true,
      },
      improveTask: {
        agent: "nestedAgent",
        inputs: {
          history: [
            { role: "user", content: ":ideaPrompt" },
            { role: "assistant", content: ":task1.text" },
          ],
          ideaSystemPrompt: ":ideaSystemPrompt",
        },
        graph: {
          version: 0.5,
          loop: {
            count: numReflections - 1,
          },
          nodes: {
            history: {
              value: "",
              update: ":task2.messages",
            },
            counter: {
              value: 2, // j + 2, j is loop counter
              update: ":counter.add(1)",
            },
            prompt: {
              agent: "stringTemplateAgent",
              params: {
                template: idea_reflection_prompt,
              },
              inputs: {
                current_round: [":counter"],
                numReflections,
              },
            },
            task2: {
              agent: "openAIAgent",
              params: {
                system: ":ideaSystemPrompt",
                model: "gpt-4o-mini",
              },
              inputs: {
                messages: ":history",
                prompt: ":prompt",
              },
              isResult: true,
            },
          },
        },
      },
      nextIdeas: {
        agent: "pushAgent",
        inputs: {
          array: ":idea_str_archive",
          item: ":improveTask.task2.text.codeBlock()",
        },
      },
      debug: {
        agent: "copyAgent",
        isResult: true,
        // console: {after: true},
        inputs: { last_history: ":improveTask.task2" },
      },
    },
  };
  return graphData;
};

//const generate_ideas = async (baseDir: string, skipGeneration = false, maxNumGenerations = 1, numReflections = 1) => {
const generate_ideas = async (baseDir: string, skipGeneration = false, maxNumGenerations = 10, numReflections = 5) => {
  if (skipGeneration) {
    const ideas = loadJsonFile(baseDir + "/ideas.json");
    return ideas;
  }

  const seedIdeas = loadJsonFile(baseDir + "/seed_ideas.json");
  const ideaStrArchive = seedIdeas.map((m: unknown) => JSON.stringify(m));
  const code = fs.readFileSync(baseDir + "/experiment.py", "utf8");
  const prompt = loadJsonFile(baseDir + "/prompt.json");

  try {
    const graphData = getGraphData(maxNumGenerations, numReflections);
    const graph = new GraphAI(graphData, agents);
    graph.injectValue("idea_str_archive", ideaStrArchive);
    graph.injectValue("ideaSystemPrompt", prompt["system"]);
    graph.injectValue("taskDescription", prompt["task_description"]);
    graph.injectValue("code", code);

    graph.onLogCallback = ({ nodeId, state, inputs }) => {
      console.log(nodeId, state, inputs);
    };
    const result = (await graph.run()) as any;
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(e);
  }
};

const main = async () => {
  const experiment = "grokking";

  const baseDir = getBaseDir(experiment);
  await generate_ideas(baseDir);
};

main();
