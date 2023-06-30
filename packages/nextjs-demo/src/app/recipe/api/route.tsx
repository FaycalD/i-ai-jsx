/** @jsxImportSource ai-jsx/react */
import * as AI from 'ai-jsx/experimental/next';
import { NextRequest } from 'next/server';
import { ChatCompletion, SystemMessage, UserMessage } from 'ai-jsx/core/completion';
import { UICompletion } from 'ai-jsx/react/completion';
import RecipeMap from '@/components/Recipe.map';
import { memo } from 'ai-jsx/core/memoize';
import { ImageGen } from 'ai-jsx/core/image-gen';
import { fileURLToPath } from 'node:url';
const {
  Recipe,
  RecipeIngredientList,
  RecipeIngredientListItem,
  RecipeInstructionList,
  RecipeInstructionListItem,
  RecipeTitle,
} = RecipeMap;
import fs from 'fs';
import path from 'path';

const useFixture = false;

export async function POST(request: NextRequest) {
  const { topic } = await request.json();

  const recipe = memo(
    <ChatCompletion temperature={1}>
      <SystemMessage>You are an expert chef.</SystemMessage>
      <UserMessage>Give me a recipe for {topic}.</UserMessage>
    </ChatCompletion>
  );

  if (useFixture) {
    const textEncoder = new TextEncoder();
    const fakeStream = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'recipe', 'api', 'fixture.txt'), 'utf-8');
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(textEncoder.encode(fakeStream));
          controller.close();
        },
      })
    );
  }

  return AI.toReactStream(
    RecipeMap,
    <>
      <ChatCompletion>
        <SystemMessage>
          The user will ask for you a recipe. Tell them you'd be happy to do that. Respond in 1-3 sentences. Do not ask
          a question. Do not give any specific details about the type of recipe you'll return, aside from mentioning the
          user's topic.
        </SystemMessage>
        <UserMessage>I'd like a recipe about {topic}</UserMessage>
      </ChatCompletion>
      <ImageGen size="256x256">
        <ChatCompletion>
          <UserMessage>Summarize the following recipe into a two sentence description: {recipe}</UserMessage>
        </ChatCompletion>
      </ImageGen>
      <UICompletion
        example={
          <Recipe>
            <RecipeTitle>Crème Chantilly</RecipeTitle>
            <RecipeIngredientList>
              <RecipeIngredientListItem>2 cups heavy cream</RecipeIngredientListItem>
              <RecipeIngredientListItem>2 tablespoons granulated sugar</RecipeIngredientListItem>
              <RecipeIngredientListItem>1 teaspoon vanilla extract</RecipeIngredientListItem>
            </RecipeIngredientList>
            <RecipeInstructionList>
              <RecipeInstructionListItem>Combine the ingredients in a large mixing bowl.</RecipeInstructionListItem>
              <RecipeInstructionListItem>
                Beat the contents on high speed until soft peaks form.
              </RecipeInstructionListItem>
              <RecipeIngredientListItem>Keep chilled until serving.</RecipeIngredientListItem>
            </RecipeInstructionList>
          </Recipe>
        }
      >
        {recipe}
      </UICompletion>
    </>
  );
}
