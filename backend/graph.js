import { tool } from "@langchain/core/tools";



const getWeather = tool((input) => {
    const { location } = input;
    return `The current weather in ${location} is sunny with a temperature of 25°C.`;
}, {
  name: 'getWeather',
  description: 'Call to get the current weather.',
  schema: z.object({
    location: z.string().describe("Location to get the weather for."),
  })
})
