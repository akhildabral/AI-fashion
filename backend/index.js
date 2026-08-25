import express from 'express';
import cors from 'cors';
import OpenAI from "openai";
import dotenv from 'dotenv';
import GoogleTrendsAPI from 'google-trends-api';
const app = express();
const port = 3000;
dotenv.config();

app.use(express.json());
app.use(cors());
const client = new OpenAI();
const clients = new OpenAI({
    baseURL: 'https://api.studio.nebius.com/v1/',
    apiKey: process.env.NEBIUS_API_KEY,
});

const NEBIUS_API_KEY = process.env.NEBIUS_API_KEY;
app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/generate', async (req, res) => {
  const { data, gender } = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const prompt = `You are a professional fashion designer and fashion expert. Your task is to help the user get the best possible outfit for ${data} for gender ${gender}.
  You should go to Google Trends use ${getGoogleTrendsData} tool for getting current trending outfits and find the current most trending outfit for user.
  After finalizing, give a detailed description of the outfit in a single line as your final answer.`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: data },
      ],
      temperature: 0.7,
      max_tokens: 256,
    });

    const response = completion.choices[0].message.content;

    console.log("User:", data);
    console.log("AI:", response);
    const image_url = await generateImage(response);

    res.json({ result: response, image: image_url });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }

});
async function generateImage(prompt) {
  try {
   const res = await clients.images.generate({
    "model": "black-forest-labs/flux-dev",
    "response_format": "url",
    "response_extension": "png",
    "width": 1024,
    "height": 1024,
    "num_inference_steps": 28,
    "negative_prompt": "",
    "seed": -1,
    "loras": null,
    "prompt": prompt
})
    .then((res) => console.log(res.data[0].url));
  } catch (error) {
    console.error("Error generating image:", error.response?.data || error.message);
  }
}

 function getGoogleTrendsData(keyword) {
  try {
    GoogleTrendsAPI.interestOverTime({ keyword: keyword }, async function (err, results) {
        const data = await JSON.parse(results);
      if (err) console.error('there was an error!', err);
      else console.log('my sweet sweet results', data);
      return data;
    });
  } catch (error) {
    console.error("Error fetching Google Trends data:", error);
    throw error;
  }
}

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});