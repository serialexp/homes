import * as deepl from 'deepl-node';
import { PrismaClient } from '@prisma/client';

// Initialize DeepL translator with your API key
// You should store this in an environment variable
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || '';
const translator = new deepl.Translator(DEEPL_API_KEY);
const prisma = new PrismaClient();

/**
 * Translates text from Japanese to English using DeepL API
 * @param text Text to translate
 * @returns Translated text or null if translation failed
 */
export async function translateJapaneseToEnglish(text: string | null): Promise<string | null> {
  if (!text) return null;
  if (!DEEPL_API_KEY) {
    console.error('DeepL API key is not set');
    return null;
  }

  try {
    const result = await translator.translateText(text, 'ja', 'en-US');
    return result.text;
  } catch (error) {
    console.error('Translation error:', error);
    return null;
  }
}

/**
 * Translates property names and titles for a list of properties
 * and updates the database with the translations
 * @param properties List of properties to translate
 * @returns Updated properties with translations
 */
export async function translateAndUpdateProperties(properties: any[]): Promise<any[]> {
  if (!DEEPL_API_KEY) {
    console.warn('DeepL API key is not set, skipping translations');
    return properties;
  }

  const propertiesNeedingTranslation = properties.filter(
    property => 
      (property.property_name && !property.translated_property_name) || 
      (property.title && !property.translated_title)
  );

  if (propertiesNeedingTranslation.length === 0) {
    return properties;
  }

  console.log(`Translating ${propertiesNeedingTranslation.length} properties...`);

  // Prepare texts for batch translation
  const textsToTranslate: { id: number; field: string; text: string }[] = [];
  
  propertiesNeedingTranslation.forEach(property => {
    if (property.property_name && !property.translated_property_name) {
      textsToTranslate.push({
        id: property.id,
        field: 'property_name',
        text: property.property_name
      });
    }
    
    if (property.title && !property.translated_title) {
      textsToTranslate.push({
        id: property.id,
        field: 'title',
        text: property.title
      });
    }
  });

  // Batch translate (DeepL has a limit of 50 texts per request)
  const batchSize = 50;
  for (let i = 0; i < textsToTranslate.length; i += batchSize) {
    const batch = textsToTranslate.slice(i, i + batchSize);
    const textsArray = batch.map(item => item.text);
    
    try {
      const translatedTexts = await translator.translateText(textsArray, 'ja', 'en-US');
      
      // Update properties with translations
      for (let j = 0; j < batch.length; j++) {
        const { id, field } = batch[j];
        const translatedText = translatedTexts[j].text;
        
        // Find the property to update
        const property = properties.find(p => p.id === id);
        if (property) {
          if (field === 'property_name') {
            property.translated_property_name = translatedText;
          } else if (field === 'title') {
            property.translated_title = translatedText;
          }
        }
        
        // Update the database
        await prisma.property.update({
          where: { id },
          data: {
            [field === 'property_name' ? 'translated_property_name' : 'translated_title']: translatedText
          }
        });
      }
    } catch (error) {
      console.error('Batch translation error:', error);
    }
  }

  return properties;
} 