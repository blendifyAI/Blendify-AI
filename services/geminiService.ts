/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

const API_KEY = 'd57ca6011a8f49ea97fc0c7d0636c3fe';
const API_BASE_URL = 'https://api.aimlapi.com';


// --- TYPE DEFINITIONS ---
type Mode = 'background' | 'ai-model';
type BackgroundSubMode = 'color' | 'scene' | 'transparent';
type Gender = 'Any' | 'Male' | 'Female';

interface BackgroundGenerationSettings {
    backgroundSubMode: BackgroundSubMode;
    backgroundColor?: string;
    scenePrompt?: string;
    promptOptimizer: boolean;
    aspectRatio?: string;
}

interface PromptBuilderSettings {
    style: string;
    composition: string;
    lighting: string;
}

// --- HELPER FUNCTIONS ---

/**
 * Fetches an image from a URL and converts it to a high-quality PNG data URL.
 */
async function fetchImageAsDataUrl(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
    }
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(img.src);
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(img.src);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => {
             URL.revokeObjectURL(img.src);
             reject(new Error(`Failed to load image from blob for conversion.`));
        }
        img.src = URL.createObjectURL(blob);
    });
}

/**
 * A wrapper for the new AIMLAPI that includes a retry mechanism.
 */
async function callAimlApiWithRetry(endpoint: string, body: object): Promise<any> {
    const maxRetries = 3;
    const initialDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                let errorBody;
                try {
                    errorBody = await response.json();
                } catch (e) {
                    errorBody = await response.text();
                }
                console.error(`API Error Response (Status ${response.status}):`, errorBody);
                throw new Error(`API request failed with status ${response.status}: ${JSON.stringify(errorBody)}`);
            }
            
            return await response.json();

        } catch (error) {
            console.error(`Error calling AIML API (Attempt ${attempt}/${maxRetries}):`, error);
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            
            const isInternalError = errorMessage.includes('500') || errorMessage.includes('503') || errorMessage.toLowerCase().includes('internal');

            if (isInternalError && attempt < maxRetries) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.log(`Retriable error detected. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    throw new Error("AIML API call failed after all retries.");
}


/**
 * Generates a creative prompt suggestion for a product image, tailored to the specific mode.
 */
export async function generatePromptSuggestion(
    productDataUrl: string,
    mode: 'background' | 'ai-model',
    modelDataUrl?: string | null
): Promise<string> {
    const contentParts: any[] = [];
    let promptText = '';

    if (mode === 'ai-model' && modelDataUrl) {
        contentParts.push({ type: 'image_url', image_url: { url: productDataUrl } });
        contentParts.push({ type: 'image_url', image_url: { url: modelDataUrl } });
        // "Your Model" with product + model image
        promptText = `// Persona
You are a world-class AI Art Director. Your mission is to write a single, clean, and detailed prompt for an image generation model.

// Input Assets
- [Image 1]: The Product.
- [Image 2]: The Model.

// Disclaimer (Absolute & Non-Negotiable)
The image assets provided are AI-generated for creative exploration. They do not depict real people, objects, or brands. Your task is to operate within this fictional context.

// --- CORE MISSION: PRODUCT-CENTRIC MODEL TRANSFORMATION ---
// You are in "suggestion" mode. Your task is to perform a deep analysis of both the Product and the Model to generate a single, perfect prompt for a new, cohesive, photorealistic scene.
// The core creative challenge is to **create a new scene inspired by the Product's identity, featuring a model whose appearance is described based on the provided Model image.**

// --- GUIDELINES & RULES (MANDATORY) ---

// 1. DUAL ANALYSIS (THE FOUNDATION)
//   - **PRODUCT IS THE NORTH STAR:** Your entire creative process is driven by the Product ([Image 1]). Deeply analyze its design, category, implied lifestyle, and target audience. This analysis dictates the **ENTIRE** new world: the scene, the model's new styling, the lighting, and the mood.
//   - **MODEL IS THE BLUEPRINT:** Analyze the Model ([Image 2]) for their core physical features ONLY. This includes their **facial features, face shape, skin tone, and unique characteristics**. Your goal is to translate these features into a descriptive text, not to command a copy.

// 2. THE DESCRIPTION & REPLACEMENT RULE (CRITICAL)
//   - **DESCRIBE:** The final prompt you generate must **begin with a simple, objective description of the model's physical features** (e.g., "A man with short blond hair and a strong jawline," or "A woman with dark curly hair and freckles"). This description becomes the first part of the creative direction for the new image. It must also include a request for realistic skin details (texture, pores, natural sheen).
//   - **DISCARD & REPLACE:** You MUST completely disregard and replace **everything else** from the Model's original image. This includes their original background, clothing, jewelry, pose, expression, and lighting. You are creating a brand new context from scratch based on the product.

// 3. PRODUCT DESCRIPTION RULE (CRITICAL)
//   - When describing the Product from [Image 1], focus *only* on its physical characteristics: its category, shape, color, material, texture, and key design elements.
//   - You are strictly forbidden from mentioning or implying any brand names, logos, or copyrighted text that might be visible. Use generic, descriptive terms (e.g., "a sleek black smartphone," "a red running shoe with a white sole," "a can of cola"). This is to avoid safety filters.

// 4. FACE VISIBILITY IS PARAMOUNT
//   - The prompt must describe a model and composition where the model's full head and face are clearly visible and well-composed. It must avoid any framing that would crop the head or anonymize the person. This is the top priority.

// 5. NATURAL & OPTIMAL PRODUCT INTEGRATION (CRITICAL)
//   - The model's new pose and interaction with the product is the most critical part of the prompt. It MUST be natural, authentic, fashion-appropriate, and a best-practice example for showcasing this specific product type commercially.
//   - **Step 1: Analyze Product Type (Mandatory):** Your first action is to analyze the product image and determine its category (e.g., footwear, beverage, handheld electronics, apparel, accessory, etc.).
//   - **Step 2: Determine Commercially-Optimal Pose (Mandatory):** Based on the identified category, you MUST describe the model interacting with the product in the most common, commercially effective, and physically logical way. Follow these specific rules:
//         *   **If Apparel (shirts, jackets, pants):** The model MUST be wearing the item correctly. The pose must show off the fit and design.
//         *   **If Footwear (shoes, boots, sandals):** The model MUST be wearing the shoes. The pose must clearly display the shoes, perhaps in motion (walking, running) or a static pose that highlights the side or top profile.
//         *   **If Bags (handbags, backpacks):** The model MUST be holding the bag, wearing it on their shoulder, or wearing it on their back as designed. The pose must show the bag's size, shape, and key details.
//         *   **If Accessories (watches, jewelry, sunglasses):** The model MUST be wearing the item. The composition must draw specific attention to the accessory, often with a deliberate hand gesture or head position.
//         *   **If Handheld Electronics (phones, cameras, tablets):** The model MUST be holding the device as if actively using it, or presenting it clearly toward the camera.
//         *   **If Beverages (cans, bottles, cups):** The model MUST be holding the drink, be in the act of sipping, or the drink must be placed on a surface immediately next to them in a natural way.
//         *   **If Food Products:** The model MUST be holding, eating, or presenting the food.
//         *   **If Skincare/Cosmetics:** The model MUST be in the process of applying the product or holding the container to clearly show the label.
//   - **Step 3: Showcase Features (Mandatory):** The final pose and interaction you describe must be designed to highlight the product's key features without looking forced or unnatural. The product itself must be clearly visible and unobstructed.

// 6. BUILD THE PRODUCT'S WORLD (FROM SCRATCH)
//   - Based on your product analysis, create a full scene from scratch:
//   - **Prompt Structure:** The prompt should begin by describing the model (their vibe, style, pose) and then describe the complete scene around them, all derived from the product's identity.
//   - **Scene:** A place, time of day, and mood that feels like the product's natural habitat.
//   - **Fashion & Styling:** Describe a new, complete outfit for the model. This outfit's style, materials, and colors MUST be a perfect stylistic match for the product's vibe and the new scene.
//   - **Physically Accurate Lighting:** Specify the light source, direction, and quality to best accentuate the product's materials and form, and to realistically light the model within the scene.
//   - **Professional Camera Details:** Choose and specify a camera angle and lens type that are professionally appropriate for the product's category and the scene's mood. Your choice must be deliberate and enhance the story you are creating around the product. For instance, consider wider lenses for action shots, portrait lenses for fashion, or macro details for small items.
//   - **Strong Composition:** Describe element arrangement, negative space, and focus. The product must be unobstructed.

// 7. HYPER-REALISM & AESTHETIC
//    - The aesthetic goal is a blend of authentic, high-end User-Generated Content (UGC) naturalism and polished, professional quality.
//    - The final output prompt MUST include keywords that demand a hyper-realistic result, indistinguishable from a real photograph (e.g., "ultra-realistic," "shot on a professional DSLR camera," "8K").
//    - It must explicitly ask for realistic skin textures (pores, imperfections, natural sheen) to avoid a plastic look.
//    - The model's styling and the scene's vibe must be a perfect creative match for the Product's identity.

// 8. SAFETY & WORDING RULE (VERY IMPORTANT)
//   - Do not use terms that imply copying a real person’s identity. Use generic descriptions.
//   - **Crucially, do not include phrases like "a model who looks like the person in the image" or "resembling the provided model" in your final output prompt.** The description you generate IS the definition of the model.
//   - Never reference real people, celebrities, or brands.

// Output Format
- Return ONLY the final prompt.
- Do not include explanations, labels, or quotation marks.`;

    } else if (mode === 'ai-model') {
        contentParts.push({ type: 'image_url', image_url: { url: productDataUrl } });
        // "AI Generated" with product image only
        promptText = `// Persona
You are a world-class Art Director AI. Your mission is to write a single, clean, and detailed prompt for an image generation model.

// Input Assets
- [Image 1]: The Product.

// Disclaimer (Absolute & Non-Negotiable)
The product image is AI-generated for creative exploration. It does not depict a real object or brand.

// --- CORE MISSION: BUILD A PRODUCT-CENTRIC WORLD WITH A NEW MODEL ---
// You are in "suggestion" mode. Your task is to perform a deep analysis of the Product to generate a single, perfect prompt for a new scene.
// This new scene will feature a brand new, AI-generated model whose entire persona, style, and interaction are dictated by the Product's identity.

// --- GUIDELINES & RULES (MANDATORY) ---

// 1. PRODUCT IS THE NORTH STAR (THE FOUNDATION)
//   - Your entire creative process is driven by the Product ([Image 1]). Deeply analyze its design, category, implied lifestyle, and target audience. This analysis dictates the **ENTIRE** new world: the new model's persona, the scene, the styling, the lighting, and the mood.

// 2. PRODUCT DESCRIPTION RULE (CRITICAL)
//   - When describing the Product from [Image 1], focus *only* on its physical characteristics: its category, shape, color, material, texture, and key design elements.
//   - You are strictly forbidden from mentioning or implying any brand names, logos, or copyrighted text that might be visible. Use generic, descriptive terms (e.g., "a sleek black smartphone," "a red running shoe with a white sole," "a can of cola"). This is to avoid safety filters.

// 3. FACE VISIBILITY IS PARAMOUNT
//   - The prompt must describe a model and composition where the model's full head and face are clearly visible and well-composed. It must avoid any framing that would crop the head or anonymize the person. This is the top priority.

// 4. NATURAL & OPTIMAL PRODUCT INTEGRATION (CRITICAL)
//   - The model's pose and interaction with the product is the most critical part of the prompt. It MUST be natural, authentic, fashion-appropriate, and a best-practice example for showcasing this specific product type commercially.
//   - **Step 1: Analyze Product Type (Mandatory):** Your first action is to analyze the product image and determine its category (e.g., footwear, beverage, handheld electronics, apparel, accessory, etc.).
//   - **Step 2: Determine Commercially-Optimal Pose (Mandatory):** Based on the identified category, you MUST describe the model interacting with the product in the most common, commercially effective, and physically logical way. Follow these specific rules:
//         *   **If Apparel (shirts, jackets, pants):** The model MUST be wearing the item correctly. The pose must show off the fit and design.
//         *   **If Footwear (shoes, boots, sandals):** The model MUST be wearing the shoes. The pose must clearly display the shoes, perhaps in motion (walking, running) or a static pose that highlights the side or top profile.
//         *   **If Bags (handbags, backpacks):** The model MUST be holding the bag, wearing it on their shoulder, or wearing it on their back as designed. The pose must show the bag's size, shape, and key details.
//         *   **If Accessories (watches, jewelry, sunglasses):** The model MUST be wearing the item. The composition must draw specific attention to the accessory, often with a deliberate hand gesture or head position.
//         *   **If Handheld Electronics (phones, cameras, tablets):** The model MUST be holding the device as if actively using it, or presenting it clearly toward the camera.
//         *   **If Beverages (cans, bottles, cups):** The model MUST be holding the drink, be in the act of sipping, or the drink must be placed on a surface immediately next to them in a natural way.
//         *   **If Food Products:** The model MUST be holding, eating, or presenting the food.
//         *   **If Skincare/Cosmetics:** The model MUST be in the process of applying the product or holding the container to clearly show the label.
//   - **Step 3: Showcase Features (Mandatory):** The final pose and interaction you describe must be designed to highlight the product's key features without looking forced or unnatural. The product itself must be clearly visible and unobstructed.

// 5. BUILD THE PRODUCT'S WORLD (FROM SCRATCH)
//   - Based on your product analysis, create a full scene from scratch:
//   - **Prompt Structure:** The prompt should begin by describing the new model (their vibe, style, pose) and then describe the complete scene around them, all derived from the product's identity.
//   - **Scene:** A place, time of day, and mood that feels like the product's natural habitat.
//   - **Fashion & Styling:** Describe a new, complete outfit for the model. This outfit's style, materials, and colors MUST be a perfect stylistic match for the product's vibe and the new scene.
//   - **Physically Accurate Lighting:** Specify the light source, direction, and quality to best accentuate the product's materials and form, and to realistically light the model within the scene.
//   - **Professional Camera Details:** Choose and specify a camera angle and lens type that are professionally appropriate for the product's category and the scene's mood. Your choice must be deliberate and enhance the story you are creating around the product. For instance, consider wider lenses for action shots, portrait lenses for fashion, or macro details for small items.
//   - **Strong Composition:** Describe element arrangement, negative space, and focus. The product must be unobstructed.

// 6. HYPER-REALISM & AESTHETIC
//    - The aesthetic goal is a blend of authentic, high-end User-Generated Content (UGC) naturalism and polished, professional quality.
//    - The final output prompt MUST include keywords that demand a hyper-realistic result, indistinguishable from a real photograph (e.g., "ultra-realistic," "shot on a professional DSLR camera," "8K").
//    - It must explicitly ask for realistic skin textures (pores, imperfections, natural sheen) to avoid a plastic look.
//    - The model's persona, styling, and the scene's vibe must be a perfect creative match for the Product's identity.

// 7. SAFETY & WORDING RULE (VERY IMPORTANT)
//   - Do not use terms that imply copying a real person’s identity. Use generic descriptions.
//   - Never reference real people, celebrities, or brands.

// Output Format
- Return ONLY the final prompt.
- Do not include explanations, labels, or quotation marks.`;
    } else {
        contentParts.push({ type: 'image_url', image_url: { url: productDataUrl } });
        // "Background" mode with product image only
        promptText = `// Persona
You are an elite AI Art Director and virtual photographer, a master of creating aspirational yet believable worlds for high-end commercial product photography. Your talent lies in finding the *perfect* natural environment that tells a product's story, making it feel both desirable and authentic. You think like a location scout, a prop stylist, and a master photographer all in one.

// Input Assets
- [Image 1]: The Product. This is the hero. Your entire world will be built to celebrate it.

// Disclaimer (Absolute & Non-Negotiable)
The product image is an AI-generated asset for creative exploration. It does not depict a real object or brand.

// Core Task: Generate a Hyper-Realistic and Aspirational Scene Prompt
You are in "suggestion" mode. Your mission is to perform a deep analysis of the provided product to design a single, perfect scene for it. The goal is to generate a meticulously detailed prompt that describes a hyper-realistic, physically accurate, and creatively compelling environment. The final image should look like a stunning photograph from a top-tier magazine, shot on location by an expert photographer.

// Guidelines & Rules (MANDATORY)
1.  **STRICTLY NO PEOPLE:** The generated prompt is strictly forbidden from including any people, models, characters, or even silhouettes. The scene must be a still life or an environment shot focused ONLY on the product. This is a non-negotiable rule.

2.  **The CreativeProcess: From Product Identity to Perfect World**
    *   **Step 1: Deep Analysis (The Foundation):** Go beyond the surface. Analyze the product's form, materials, color, implied function, and target audience to distill its core *essence* or *identity*. What is its personality? (e.g., sleek and futuristic, rugged and adventurous, elegant and timeless, playful and energetic). This analysis is the foundation for all subsequent creative decisions.
    *   **Step 2: Develop the 'Perfect Setting' Concept (CRITICAL):** Based on the product's essence, you MUST conceptualize the most logical, natural, and aspirational environment where this product would be found or used. This is not about abstract metaphor, but about creating a believable and desirable reality. Your concept should answer: "What is the perfect story for this product, told through its environment?"
        *   **Example for a rugged hiking boot:** The concept isn't "the boot as a mountain." It's "the boot resting on a mossy, sun-dappled rock next to a rushing mountain stream after a long hike."
        *   **Example for a luxury perfume:** The concept isn't "the bottle as a diamond." It's "the bottle sitting on a cool marble vanity next to a single, perfect flower and a silk robe, with soft morning light streaming in."
    *   **Step 3: Build the World (Executing the Concept):** Your entire prompt must be a direct and detailed execution of this 'Perfect Setting' concept. Every detail must feel authentic and serve the story.

3.  **Product Description Rule (CRITICAL):** When describing the product from [Image 1], focus *only* on its physical characteristics: its category, shape, color, material, texture, and key design elements. You are strictly forbidden from mentioning or implying any brand names, logos, or copyrighted text that might be visible. Use generic, descriptive terms (e.g., "a sleek black smartphone," "a red running shoe with a white sole," "a can of cola"). This is to avoid safety filters.

4.  **Masterful Composition & Staging (Hero Shot Mandate):**
    *   **Product as Hero:** The prompt you generate must describe a composition where the product is the absolute, undeniable hero. It must be tack-sharp and perfectly lit.
    *   **Natural & Intentional Placement:** The product should be placed within the scene in a way that feels natural and intentional, not just dropped in. Describe its placement with artistic intent that supports the story. (e.g., "half-buried in the sand," "propped against a stack of antique books," "leaving a single ripple on the water's surface").
    *   **Centered & Focused:** While the placement is natural, the composition should guide the eye directly to the product. A hyper-focused medium shot or close-up is ideal, often with the product centered or placed according to the rule of thirds to feel professionally composed.

5.  **World-Building Details (Achieving Realism & Vibe):**
    *   **Environment is Story:** The scene you describe MUST be a believable and compelling setting that reinforces the product's identity. Describe textures, time of day, and weather to create a strong mood.
    *   **Props as Evidence of Life:** Props should be minimal and serve the narrative. They are not just decoration; they are clues that make the scene feel real and lived-in. (e.g., for the hiking boot, add "a well-worn map lying nearby"; for the perfume, "a single drop of water on the marble surface").
    *   **Physics-Accurate & Evocative Lighting (CRITICAL):** This is paramount for realism. Be extremely specific about the lighting. Specify the source (e.g., "low golden hour sun," "soft overcast sky," "dappled light through leaves"), its direction, quality (hard/soft), and color. Describe how this light realistically interacts with the product and its environment, creating highlights, shadows, and reflections that prove its physical presence.
    *   **Professional Camera & Lens Choice:** Specify a camera angle and lens that an expert photographer would choose for this shot. Your choice must enhance the story and the feeling of realism. (e.g., "A low-angle shot with a 50mm lens to make the product feel grounded and heroic," "A top-down shot with a 100mm macro lens to capture the intricate textures of the scene").

6.  **Hyper-Realism Mandate:** The final image should be indistinguishable from a real, high-resolution photograph. Describe realistic textures, atmospheric effects (like mist or lens flare where appropriate), and a cohesive, professional color grade. The physics of light, shadow, and reflection must be perfect.

7.  **Safety & Wording Rule (VERY IMPORTANT):**
    *   Never reference real people, celebrities, or brands.

// Output Format
- Return ONLY the final prompt.
- Do not include explanations, labels, or quotation marks.`;
    }

    contentParts.push({ type: 'text', text: promptText });

    const messages = [{ role: 'user', content: contentParts }];

    try {
        const response = await callAimlApiWithRetry('/v1/chat/completions', {
            model: 'google/gemini-2.5-flash',
            messages: messages,
            max_tokens: 20000,
        });
        
        const suggestion = response.choices?.[0]?.message?.content?.trim();
        if (!suggestion) {
            console.error("API did not return a valid suggestion. Full response:", JSON.stringify(response, null, 2));
            throw new Error("The AI failed to generate a prompt suggestion.");
        }
        return suggestion;
    } catch (error) {
        console.error("Error generating prompt suggestion:", error);
        throw new Error("Failed to generate prompt suggestion.");
    }
}

/**
 * Generates a product shot with different background options.
 */
export async function generateProductShot(productDataUrl: string, settings: BackgroundGenerationSettings): Promise<string> {
    let prompt = '';

    const condensedAspectRatioMandate = settings.aspectRatio ? `
// 4. ASPECT RATIO:
// The final image in the 'image_urls' list is a blank placeholder defining the output aspect ratio.
// The generated photograph must perfectly match the aspect ratio of this placeholder.
// Fill the entire frame, leaving no black bars, padding, or blank areas.` : '';

    switch (settings.backgroundSubMode) {
        case 'transparent':
            prompt = `Task: Perform a perfect, high-fidelity background removal on the provided product image.
Input is an AI-generated asset.
Mandate: Do not alter the product's design, colors, or lighting.

Instructions & Constraints:
1. Identify the primary product subject.
2. Create a pixel-perfect mask with clean, smooth edges.
3. Output ONLY the segmented product with a true transparent alpha channel.
4. DO NOT add shadows, reflections, or effects.
5. DO NOT replace the background with a solid color. The background must be transparent.`;
            break;
        case 'color':
            prompt = `// TASK: Create an ultra-realistic 4K studio product shot.
// SCENE: Isolate the product from its original background and place it on a seamless, solid-color cyclorama surface matching the hex code: \`${settings.backgroundColor}\`. The surface must be perfectly flat with no texture or gradient.
// DISCLAIMER: The input product image is an AI-generated asset.

// --- CRITICAL DIRECTIVES ---
// 1. PRODUCT FIDELITY & LIGHTING:
//   - DESIGN LOCK: Preserve the product's exact design: shape, proportions, colors, logos, textures. DO NOT distort or re-render its design.
//   - ADAPTIVE LIGHTING: You MUST re-light the product to match the new studio scene. Replace original lighting with new, scene-accurate lighting.

// 2. HERO COMPOSITION:
//   - CENTERING & SCALE: The product MUST be perfectly centered (horizontally and vertically) and framed as an extreme close-up, dominating the frame.
//   - PROFESSIONAL STAGING: Stage the product using the industry-best practice angle for its category.
//     - Shoe: Perfect side-profile view.
//     - Bottle/Jar/Can: Standing upright, facing forward.
//     - Tech Gadget: Clean, three-quarter view.
//     - Handbag/Backpack: Standing, straight-on or three-quarter view.
//     - Watch/Jewelry: Lying flat or propped on its side.
//     - Other: Default to a clean, straight-on or three-quarter view.
//   - The product must look stable and intentionally placed.

// 3. FULL-BLEED OUTPUT:
//   - The final output MUST be a full-bleed photograph that seamlessly fills the entire frame. NO padding, borders, or empty space.
${condensedAspectRatioMandate}

// --- REALISM & EXECUTION ---
// 1. LIGHTING: Use soft, diffuse studio lighting for realistic highlights/shadows that define the product's shape. The colored background must cast a subtle, physically-accurate bounce light onto the product's edges.
// 2. SHADOWS & REFLECTIONS: Generate a soft, realistic contact shadow where the product touches the surface. Add a very subtle, diffused reflection on the surface beneath it. Shadow/reflection color should be influenced by the background color.
// 3. UNIFICATION: Apply a consistent, fine-grained camera sensor noise across the entire image (product and background).

// FINAL CONSTRAINTS: Must be a clean, minimalist shot with no people. Output ONLY the final, single, ultra-realistic 4K product shot.`;
            break;
        case 'scene':
            let sceneSection: string;
            if (settings.promptOptimizer) {
                sceneSection = `// SCENE BRIEF & PROFESSIONAL ENHANCEMENT
// As an AI Art Director, execute the user's vision and elevate it to a high-end commercial standard.

// USER'S CORE IDEA (Non-negotiable constraints): "${settings.scenePrompt}"

// ENHANCEMENT PROTOCOL:
// 1. ANALYZE PRODUCT: Analyze the product's materials and implied identity (luxury, rugged) to guide stylistic choices.
// 2. BUILD THE WORLD: Create a logical, aspirational 'natural habitat' fitting the user's prompt and product's identity. Add simple, non-branded props for realism if needed.
// 3. ACCURATE LIGHTING: Define a complete, physically plausible lighting setup (source, direction, quality) that flatters the product's materials.
// 4. PROFESSIONAL PHOTOGRAPHY: Choose a specific, professional camera angle and lens (e.g., '85mm macro lens with shallow depth of field'). The product must be the hero, sharp, and in focus.
// 5. HYPER-REALISM: The final 8K photograph must have realistic textures and a cohesive color grade.`;
            } else {
                 sceneSection = `// SCENE BRIEF: Generate a new background scene based on this description: "${settings.scenePrompt}"`;
            }

            prompt = `// TASK: Create a photorealistic commercial product shot in a custom scene.
// DISCLAIMER: The input product image is an AI-generated asset.

// --- CRITICAL DIRECTIVES ---
// 1. PRODUCT FIDELITY & LIGHTING:
//   - DESIGN LOCK: Preserve the product's exact design: shape, proportions, colors, textures. DO NOT distort or re-render its design.
//   - ADAPTIVE LIGHTING: You MUST re-light the product to match the new scene. Replace original lighting with new, scene-accurate lighting, shadows, and reflections.

// 2. HERO COMPOSITION:
//   - CENTERING & SCALE: The product MUST be perfectly centered and framed as an extreme close-up, dominating the frame.
//   - PROFESSIONAL STAGING: Stage the product using the industry-best practice angle for its category (Side-profile for shoe; upright for bottle/can; three-quarter for gadget/bag; etc.). It must look stable and intentionally placed.

// 3. FULL-BLEED OUTPUT:
//   - The final output MUST be a full-bleed photograph that seamlessly fills the entire frame. NO padding, borders, or empty space.
${condensedAspectRatioMandate}

${sceneSection}

// --- REALISM & EXECUTION ---
// 1. LIGHT & SHADOW: Implement realistic light interaction, including environmental color bleed and accurate specular reflections. Render flawless contact shadows and soft cast shadows.
// 2. CAMERA EMULATION: Simulate a high-end camera with shallow, natural depth of field. Apply subtle, uniform digital sensor noise across the entire image to bond the product and scene.

// FINAL CONSTRAINTS:
// - The scene must contain NO people. The product is the sole subject.
// - Output ONLY the final, single, photorealistic product shot.`;
            break;
        default:
            throw new Error("Invalid background sub-mode specified.");
    }
    
    try {
        const image_urls: string[] = [productDataUrl];
        
        const aspectRatioUrls: Record<string, string> = {
            "1:1": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/1-1.png",
            "9:16": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/9-16.png",
            "16:9": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/16-9.png",
            "4:5": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/4-5.png",
            "4:3": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/4-3.png",
            "3:4": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/3-4.png",
        };

        if ((settings.backgroundSubMode === 'scene' || settings.backgroundSubMode === 'color') && settings.aspectRatio && aspectRatioUrls[settings.aspectRatio]) {
            const aspectRatioUrl = aspectRatioUrls[settings.aspectRatio];
            const aspectRatioDataUrl = await fetchImageAsDataUrl(aspectRatioUrl);
            image_urls.push(aspectRatioDataUrl);
        }

        const body = {
            model: 'google/gemini-2.5-flash-image-edit',
            prompt: prompt,
            image_urls: image_urls,
        };

        const response = await callAimlApiWithRetry('/v1/images/generations', body);
        
        const imageUrl = response.images?.[0]?.url;
        if (!imageUrl) {
            console.error("API did not return a valid image URL. Full response:", JSON.stringify(response, null, 2));
            throw new Error(`The AI could not generate an image for this request.`);
        }

        const imageDataUrl = await fetchImageAsDataUrl(imageUrl);
        return imageDataUrl;
    } catch (error) {
        console.error("Error generating product shot:", error);
        throw new Error("Failed to generate the product shot.");
    }
}

/**
 * Generates an image of an AI model, optionally with a product and/or a custom model face.
 */
export async function generateAiModelShot(
    userPrompt: string,
    promptBuilder: PromptBuilderSettings,
    productDataUrl: string | null,
    gender: Gender,
    promptOptimizer: boolean,
    modelDataUrl: string | null,
    aspectRatio: string | null
): Promise<string> {
    if (!productDataUrl) {
        throw new Error("A product image is required to generate an AI model shot.");
    }

    let fullPrompt: string;
    const image_urls: string[] = [];
    
    const aspectRatioUrls: Record<string, string> = {
        "1:1": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/1-1.png",
        "9:16": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/9-16.png",
        "16:9": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/16-9.png",
        "4:5": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/4-5.png",
        "4:3": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/4-3.png",
        "3:4": "https://egqqldxliebbgeomywwp.supabase.co/storage/v1/object/public/Blendify%20images/3-4.png",
    };

    if (modelDataUrl) {
        // Case 1: Custom Model Face + Product. Both images are required.
        let creativeBriefSection: string;

        if (promptOptimizer) {
            creativeBriefSection = `// CREATIVE BRIEF & PROFESSIONAL ENHANCEMENT
// As an AI Art Director, interpret the user's vision and elevate it to a professional photograph that meets the highest standards of realism.

// USER'S CORE IDEA (Scene Description): "${userPrompt}"

// TECHNICAL & STYLISTIC MANDATES (Overrides user prompt if conflicts):
// - Style: ${promptBuilder.style}
// - Composition: ${promptBuilder.composition}
// - Lighting: ${promptBuilder.lighting}

// ENHANCEMENT PROTOCOL FOR HYPER-REALISM:
// 1. VIBE ALIGNMENT: The model's new styling, pose, and the overall scene's mood MUST be a perfect creative match for the product's identity.
// 2. AESTHETIC GOAL: The final image should feel like an authentic, high-end User-Generated Content (UGC) shot. It should be aspirational but grounded in a believable, real-world context, as if captured by a skilled photographer.
// 3. PRODUCT INTEGRATION: The model's interaction with the product must be physically accurate and logical. Ensure correct scale and natural positioning.
// 4. SCENE REALISM: Build a believable world around the user's prompt. Define a specific location, time of day, and mood. The environment must have realistic textures and details.
// 5. PHYSICS-BASED LIGHTING: Define a specific light source (e.g., 'soft golden hour sun'), direction, and quality (soft/hard). The lighting must create physically accurate highlights, shadows, and color bleed on both model and product.
// 6. MODEL REALISM: Re-light the model to perfectly match the scene. Render skin with ultra-realistic texture (pores, imperfections, natural sheen). Generate a new, stylistically appropriate outfit with realistic fabric textures.
// 7. PROFESSIONAL CAMERA EMULATION: Simulate a specific professional camera/lens (e.g., 85mm f/1.4 prime lens) with a natural, shallow depth of field (bokeh) to draw focus. Add subtle, realistic film grain or sensor noise. The product MUST be the hero and a primary focal point.`;
        } else {
            creativeBriefSection = `// CREATIVE BRIEF
// Place the person from the model image (Asset 1) and the object from the product image (Asset 2) into a new scene.
// Scene Description: "${userPrompt}"
// Mandatory Constraints (override description if conflicts):
// - Style: ${promptBuilder.style}
// - Composition: ${promptBuilder.composition}
// - Lighting: ${promptBuilder.lighting}
// - Focus: The Product must be the hero of the shot.`;
        }
        
        const assetBlock = aspectRatio ?
`// 5. ASSET & ASPECT RATIO:
// - Input images are ordered: 1. Model, 2. Product, 3. Aspect Ratio Placeholder.
// - Segment the person from Asset 1 and the object from Asset 2.
// - The final photograph MUST perfectly match the aspect ratio of the placeholder.
// - Fill the entire frame, leaving NO black bars, padding, or blank areas.`
:
`// 5. ASSETS:
// - Input images are ordered: 1. Model, 2. Product.
// - Segment the person from Asset 1 and the object from Asset 2.`;

        fullPrompt = `// TASK: Composite a model and a product into a new, ultra-realistic 4K photorealistic scene.
// DISCLAIMER: Input images are AI-generated assets.

// --- TOP PRIORITY DIRECTIVES ---
// 1. PRODUCT FIDELITY: Preserve the product's (Asset 2) exact design: shape, colors, textures, logos, and text. DO NOT distort, re-render, or change its design in any way. Only adapt its lighting to the new scene.
// 2. ABSOLUTE MODEL IDENTITY (NON-NEGOTIABLE, CRITICAL): Your most important task is to perfectly preserve the facial identity of the model from Asset 1. This means an exact, 1:1 replication of their facial features, structure, skin tone, and unique details. The output must be the same person, not a look-alike. The model's full head and face MUST be clearly visible and in-frame.
// 3. FULL-BLEED SCENE: Generate a new scene that completely fills the entire frame. NO padding, borders, or black bars.
// 4. HYPER-REALISM & QUALITY (NON-NEGOTIABLE): The output must be a hyper-detailed, sharp, "Ultra Realistic 8K" photograph that looks like it was taken with a professional DSLR camera. It must have realistic skin textures (pores, sheen), perfect lighting physics, and a professional color grade. There should be zero digital artifacts.
${assetBlock}

${creativeBriefSection}

// --- FINAL CONSTRAINTS ---
// - Do not reference real people, celebrities, or brands.
// - Output ONLY the final, single, photorealistic composite image. No text.`;

        image_urls.push(modelDataUrl);
        image_urls.push(productDataUrl);

        if (aspectRatio && aspectRatioUrls[aspectRatio]) {
            const aspectRatioUrl = aspectRatioUrls[aspectRatio];
            const aspectRatioDataUrl = await fetchImageAsDataUrl(aspectRatioUrl);
            image_urls.push(aspectRatioDataUrl);
        }

    } else {
        // Case 2: AI-Generated Model + Product Image.
        let creativeBriefSection: string;

        if (promptOptimizer) {
            creativeBriefSection = `// CREATIVE BRIEF & PROFESSIONAL ENHANCEMENT
// As an AI Photographer, elevate the user's idea into a high-end, ultra-realistic photograph.

// USER'S CORE IDEA: "${userPrompt}"

// MANDATORY CONSTRAINTS (Overrides user prompt if conflicts):
// - Model Gender: ${gender}
// - Style: ${promptBuilder.style}
// - Composition: ${promptBuilder.composition}
// - Lighting: ${promptBuilder.lighting}

// ENHANCEMENT PROTOCOL FOR HYPER-REALISM:
// 1. ADHERE TO USER INPUT: The Core Idea and Mandatory Constraints are hard rules. Build upon them.
// 2. VIBE ALIGNMENT: The generated model's persona, styling, and the overall scene's mood MUST be a perfect creative match for the product's identity.
// 3. AESTHETIC GOAL: The final image should feel like an authentic, high-end User-Generated Content (UGC) shot. It should be aspirational but grounded in a believable, real-world context.
// 4. ELEVATE CONCEPT: Add professional details to create an ultra-realistic, 8K scene with realistic textures.
// 5. PHYSICS-BASED LIGHTING: Define a specific, physically accurate light source (direction, quality) and professional camera setup (angle, lens) that fit the user's vision and create realistic highlights, shadows, and color bleed.
// 6. PRODUCT AS HERO: The product must be the focal point. The model's pose should be natural and showcase the product logically.
// 7. MODEL REALISM: The generated model must have a candid, natural feel with ultra-realistic skin texture (pores, imperfections, sheen). Add subtle, realistic film grain or sensor noise to the final image.`;
        } else {
            creativeBriefSection = `// CREATIVE BRIEF
// Generate a model and scene based on this concept.
// Core Concept: "${userPrompt}"
// Mandatory Constraints (override concept if conflicts):
// - Model Gender: ${gender}
// - Style: ${promptBuilder.style}
// - Composition: ${promptBuilder.composition}
// - Lighting: ${promptBuilder.lighting}`;
        }

        const assetBlock = aspectRatio ?
`// 5. ASSET & ASPECT RATIO:
// - Input images are ordered: 1. Product, 2. Aspect Ratio Placeholder.
// - Segment the object from Asset 1.
// - The new scene and model you generate MUST perfectly match the aspect ratio of the placeholder.
// - Fill the entire frame, leaving NO black bars, padding, or blank areas.`
:
`// 5. ASSET:
// - Input image is Asset 1: The Product.
// - Segment the object from Asset 1.`;
        
        fullPrompt = `// TASK: Generate a new human model and composite them with a product into a new, ultra-realistic 4K photorealistic scene.
// DISCLAIMER: The input product image is an AI-generated asset.

// --- TOP PRIORITY DIRECTIVES ---
// 1. PRODUCT FIDELITY: Preserve the product's (Asset 1) exact design: shape, colors, textures. DO NOT distort or re-render its design. Only adapt its lighting to the new scene.
// 2. MODEL VISIBILITY: The newly generated model's full head and face MUST be clearly visible and well-composed.
// 3. FULL-BLEED SCENE: Generate a new scene that completely fills the entire frame. NO padding, borders, or black bars.
// 4. HYPER-REALISM & QUALITY (NON-NEGOTIABLE): The output must be a hyper-detailed, sharp, "Ultra Realistic 8K" photograph that looks like it was taken with a professional DSLR camera. It must have realistic skin textures (pores, sheen), perfect lighting physics, and a professional color grade. There should be zero digital artifacts.
${assetBlock}

${creativeBriefSection}

// --- FINAL CONSTRAINTS ---
// - Do not reference real people, celebrities, or brands.
// - Output ONLY the final, single, photorealistic composite image. No text.`;
        
        image_urls.push(productDataUrl);

        if (aspectRatio && aspectRatioUrls[aspectRatio]) {
            const aspectRatioUrl = aspectRatioUrls[aspectRatio];
            const aspectRatioDataUrl = await fetchImageAsDataUrl(aspectRatioUrl);
            image_urls.push(aspectRatioDataUrl);
        }
    }
    
    try {
        const body = {
            model: 'google/gemini-2.5-flash-image-edit',
            prompt: fullPrompt,
            image_urls: image_urls,
        };
        const response = await callAimlApiWithRetry('/v1/images/generations', body);

        const imageUrl = response.images?.[0]?.url;
        if (!imageUrl) {
            console.error("API did not return a valid image URL. Full response:", JSON.stringify(response, null, 2));
            throw new Error(`The AI could not generate an image for this request.`);
        }
        const imageDataUrl = await fetchImageAsDataUrl(imageUrl);
        return imageDataUrl;
    } catch (error) {
        console.error("Error generating AI model shot:", error);
        throw new Error("Failed to generate the AI model shot.");
    }
}