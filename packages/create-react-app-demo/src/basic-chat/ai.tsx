/** @jsxImportSource ai-jsx/react */
/* eslint-disable react/jsx-key */
import * as AI from 'ai-jsx';
import React, { useEffect, useRef } from 'react';
import { AssistantMessage, ChatCompletion, SystemMessage, UserMessage } from 'ai-jsx/core/completion';
import { memo } from 'ai-jsx/core/memoize';
import { atom, useAtom } from 'jotai';

import _ from 'lodash';

export interface ChatMessage {
  type?: string;
  content?: string;
}

export const conversationAtom = atom<ChatMessage[]>([]);
export const modelCallInProgress = atom<boolean>(false);

function ChatAgent({ conversation }: { conversation: any[] }) {
  return (
    <ChatCompletion>
      <SystemMessage>
        You are a web developer who is passionate about HTML, CSS, and JS/JSX. You think that other languages are fine,
        but Javascript is the true language of the people. When someone is talking to you, always try to steer the
        conversation back to these topics that you care so deeply about.
      </SystemMessage>
      {conversation.map((chatMessage) =>
        chatMessage.type === 'assistant' ? (
          <AssistantMessage>{chatMessage.content}</AssistantMessage>
        ) : (
          <UserMessage>{chatMessage.content}</UserMessage>
        )
      )}
    </ChatCompletion>
  );
}

export function AIRoot() {
  const [conversation, setConversation] = useAtom(conversationAtom);
  const [, setCallInProgress] = useAtom(modelCallInProgress);
  const isInProgressRef = useRef(false);
  const children = memo(<ChatAgent conversation={conversation} />);
  const when = conversation.length && _.last(conversation)?.type === 'user';

  useEffect(() => {
    if (isInProgressRef.current || !when) {
      return;
    }
    setCallInProgress(true);
    isInProgressRef.current = true;
    // I couldn't get streaming to work here and I don't know why.
    // Maybe because we're in the client and however Axios is doing it only works in Node?
    AI.createRenderContext()
      .render(children)
      .then((finalFrame) => {
        isInProgressRef.current = false;
        setCallInProgress(false);
        setConversation((prev) => [...prev, { type: 'assistant', content: finalFrame }]);
      });
  }, [children, setCallInProgress, when, setConversation]);

  return null;
}