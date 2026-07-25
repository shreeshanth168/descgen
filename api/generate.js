// ======================================================
// DescGen AI - Complete Production API
// Part 1/5
// ======================================================

const GEMINI_MODEL = "gemini-3.5-flash-lite";

const SPLIT_TOKEN = "---SECTION---";


// ======================================================
// AI System Instructions
// ======================================================

const SYSTEM_PROMPT = `
You are DescGen AI.

You are a professional e-commerce copywriting AI.

Your job is to create:
- Marketplace listings
- SEO content
- Marketing copy
- FAQs
- Product specifications

Rules:

- Write human sounding content.
- Focus on conversions.
- Focus on customer benefits.
- Use clear professional language.
- Never explain your process.
- Never add unnecessary notes.
- Return only the requested content.

`;


// ======================================================
// Platform Templates
// ======================================================

const TEMPLATES = {

amazon: `
Create Amazon listing content.

Include:

1. SEO optimized title
2. Five bullet points
3. Product description

Rules:
- Highlight benefits
- Include important keywords
- Make it conversion focused
`,

shopify: `
Create Shopify product page copy.

Include:

- Product headline
- Storytelling description
- Benefits
- Features
- Call to action

Make it premium brand style.
`,

etsy: `
Create Etsy listing copy.

Include:

- Emotional storytelling
- Handmade/personal feeling
- SEO friendly wording
- Customer connection
`,

flipkart: `
Create Flipkart product listing.

Include:

- Simple Indian customer language
- Benefits
- Features
- Buying motivation
`,

meesho: `
Create Meesho product listing.

Include:

- Short catchy description
- Affordable appeal
- Indian audience focused
- Conversion focused
`

};
// ======================================================
// Part 2/5
// Prompt Builder + Input Cleaning
// ======================================================


// ======================================================
// Clean User Input
// ======================================================

function cleanInput(value = "") {

  return String(value)
    .trim()
    .replace(/[<>]/g, "")
    .substring(0, 5000);

}



// ======================================================
// Build AI Prompt
// ======================================================

function buildPrompt(product) {


  const platform =
    product.platform &&
    TEMPLATES[product.platform]
      ? TEMPLATES[product.platform]
      : `
Create premium product descriptions.
`;



  return `

${SYSTEM_PROMPT}


PRODUCT DETAILS

Product Name:

${product.name}


Features:

${product.features}


Tone:

${product.tone}


Platform:

${product.platform || "General"}



TASK:

${platform}



Also generate:

SEO Title:
Maximum 60 characters.

SEO Meta Description:
Maximum 155 characters.

Keywords:
Generate 20 relevant SEO keywords separated by commas.

Instagram Caption:
Include hook, benefits, CTA and hashtags.

Facebook Advertisement:
Create conversion focused ad copy.

WhatsApp Promotion:
Create short promotional message.

FAQ:
Create 5 common customer questions with answers.

Specifications:
Create professional product specifications.



IMPORTANT:

Separate every section using exactly:

${SPLIT_TOKEN}


Return only the generated content.

`;
}



// ======================================================
// Parse AI Sections
// ======================================================

function parseSections(text = "") {


  const sections =
    text
      .split(SPLIT_TOKEN)
      .map(section => section.trim())
      .filter(Boolean);



  return {

    marketplace:
      sections[0] || "",


    seoTitle:
      sections[1] || "",


    seoMeta:
      sections[2] || "",


    keywords:
      sections[3] || "",


    instagram:
      sections[4] || "",


    facebook:
      sections[5] || "",


    whatsapp:
      sections[6] || "",


    faq:
      sections[7] || "",


    specifications:
      sections[8] || ""

  };

}
// ======================================================
// Part 3/5
// Gemini API Connection
// ======================================================


// ======================================================
// Create Gemini Request Body
// ======================================================

function createGeminiBody(prompt) {

  return {

    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],


    generationConfig: {

      temperature: 0.85,

      topP: 0.95,

      maxOutputTokens: 8192

    }

  };

}



// ======================================================
// Call Gemini API
// ======================================================

async function callGemini(apiKey, prompt) {


  const response = await fetch(

    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,

    {

      method: "POST",


      headers: {

        "Content-Type": "application/json"

      },


      body: JSON.stringify(

        createGeminiBody(prompt)

      )

    }

  );



  if (!response.ok) {


    const errorText =
      await response.text();


    console.error(
      "Gemini API Error:",
      errorText
    );


    throw new Error(
      "Gemini API failed"
    );

  }



  const data =
    await response.json();



  return (

    data
      ?.candidates?.[0]
      ?.content?.parts?.[0]
      ?.text

      || ""

  );

}



// ======================================================
// Retry System
// ======================================================

async function callGeminiWithRetry(

  apiKey,

  prompt

) {


  const maxAttempts = 3;



  for (

    let attempt = 1;

    attempt <= maxAttempts;

    attempt++

  ) {


    try {


      return await callGemini(

        apiKey,

        prompt

      );


    } catch(error) {


      console.error(

        `Gemini attempt ${attempt} failed:`,

        error.message

      );



      if (

        attempt === maxAttempts

      ) {

        throw error;

      }



      await new Promise(

        resolve =>

          setTimeout(

            resolve,

            attempt * 1500

          )

      );

    }

  }

}
// ======================================================
// Part 4/5
// Request Validation + API Handler
// ======================================================


// ======================================================
// Validate Request
// ======================================================

function validateRequest(body = {}) {

  const errors = [];


  if (!body.name || !body.name.trim()) {

    errors.push(
      "Product name is required"
    );

  }


  if (!body.features || !body.features.trim()) {

    errors.push(
      "Product features are required"
    );

  }


  if (!body.tone || !body.tone.trim()) {

    errors.push(
      "Tone is required"
    );

  }


  return errors;

}



// ======================================================
// Create Error Response
// ======================================================

function errorResponse(message) {

  return {

    success: false,

    error: message

  };

}



// ======================================================
// Vercel Serverless Function
// ======================================================

export default async function handler(req, res) {


  if (req.method !== "POST") {

    return res.status(405).json(

      errorResponse(
        "Method not allowed"
      )

    );

  }



  const apiKey =
    process.env.GEMINI_API_KEY;



  if (!apiKey) {


    return res.status(500).json(

      errorResponse(
        "GEMINI_API_KEY is missing"
      )

    );


  }



  try {


    const body =
      req.body || {};



    const errors =
      validateRequest(body);



    if (errors.length > 0) {


      return res.status(400).json({

        success: false,

        errors

      });


    }



    const product = {


      name:

        cleanInput(body.name),



      features:

        cleanInput(body.features),



      tone:

        cleanInput(body.tone),



      platform:

        cleanInput(
          body.platform || ""
        )


    };



    const prompt =
      buildPrompt(product);



    const aiText =
      await callGeminiWithRetry(

        apiKey,

        prompt

      );



    if (!aiText) {


      return res.status(502).json(

        errorResponse(

          "AI returned empty response"

        )

      );


    }



    const result =
      parseSections(aiText);



    return res.status(200).json({

      success: true,

      data: result

    });



  } catch(error) {


    console.error(

      "Server Error:",

      error

    );



    return res.status(500).json(

      errorResponse(

        "Something went wrong. Please try again."

      )

    );


  }

}
// ======================================================
// Part 5/5
// Final Cleanup + Production Helpers
// ======================================================


// ======================================================
// Response Cleaner
// ======================================================

function cleanAIResponse(text = "") {

  return text

    .replace(/\r/g, "")

    .replace(/\n{3,}/g, "\n\n")

    .trim();

}



// ======================================================
// Supported Platforms
// ======================================================

const SUPPORTED_PLATFORMS = [

  "amazon",

  "shopify",

  "etsy",

  "flipkart",

  "meesho"

];



// ======================================================
// Platform Validator
// ======================================================

function validatePlatform(platform = "") {


  if (!platform) {

    return "";

  }


  const value =
    platform.toLowerCase();



  if (

    SUPPORTED_PLATFORMS.includes(value)

  ) {

    return value;

  }


  return "";

}



// ======================================================
// Production Health Check
// ======================================================

function apiStatus() {

  return {

    service: "DescGen AI",

    status: "running",

    version: "1.0.0"

  };

}
