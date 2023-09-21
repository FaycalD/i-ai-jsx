import type { Jsonifiable } from 'type-fest';
import { AgentId, ConversationId, MessageGenerationParams, MessageRequestParams } from './sidekick-types.js';

export interface UserInfo {
  id: number;
  username: string;
  is_authenticated: boolean;
  is_superuser: boolean;
  is_staff: boolean;
  is_active: boolean;
  is_anonymous: boolean;
  email?: string;
  first_name?: string;
  last_name?: string;
  last_login?: Date;
  date_joined?: Date;
  api_token?: string;
  avatar?: string;
  organization?: string;
}

export class AgentDoesNotExistError extends Error {
  code = 'agent-does-not-exist';
}

const debug =
  typeof process !== 'undefined' &&
  // Don't make any assumptions about the environment.
  /* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */
  process.env?.FIXIE_DEBUG === 'true';

/**
 * A client to the Fixie AI platform.
 *
 * This client can be used on the web or in NodeJS
 */
export class IsomorphicFixieClient {
  /**
   * Use the `Create*` methods instead.
   */
  protected constructor(public readonly url: string, public readonly apiKey?: string) {}

  static Create(url: string, apiKey?: string) {
    const apiKeyToUse = apiKey ?? process.env.FIXIE_API_KEY;
    if (!apiKeyToUse) {
      throw new Error(
        'You must pass apiKey to the constructor, or set the FIXIE_API_KEY environment variable. The API key can be found at: https://console.fixie.ai/profile'
      );
    }
    return new this(url, apiKey);
  }

  /**
   * Create a new FixieClient without an API key. This is only useful for accessing public APIs, such as the conversation APIs.
   */
  // This is also useful for running in the console.fixie.ai webapp, because it's on the same host
  // as the backend and thus doesn't need the API key, assuming we set the auth cookies to be cross-domain.
  static CreateWithoutApiKey(url: string) {
    return new this(url);
  }

  /** Send a request to the Fixie API with the appropriate auth headers. */
  async request(path: string, bodyData?: unknown, method?: string, options: RequestInit = {}) {
    const fetchMethod = method ?? (bodyData ? 'POST' : 'GET');

    const headers: RequestInit['headers'] = {};
    if (bodyData) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    if (debug) {
      console.log(`[Fixie request] ${this.url}${path}`, bodyData);
    }
    const res = await fetch(`${this.url}${path}`, {
      ...options,
      method: fetchMethod,
      headers,
      // This is needed so serverside NextJS doesn't cache POSTs.
      cache: 'no-store',
      body: bodyData ? JSON.stringify(bodyData) : undefined,
    });

    return res;
  }

  async requestJson(path: string, bodyData?: unknown, method?: string, options?: RequestInit): Promise<Jsonifiable> {
    const res = await this.request(path, bodyData, method, options);
    if (!res.ok) {
      throw new Error(`Failed to access Fixie API ${this.url}${path}: ${res.statusText}`);
    }
    return res.json();
  }

  /** Return information on the currently logged-in user. */
  userInfo(): Promise<UserInfo> {
    const rawUserInfo: unknown = this.request('/api/user');
    return rawUserInfo as Promise<UserInfo>;
  }

  /** List Corpora visible to this user. */
  listCorpora(): Promise<Jsonifiable> {
    return this.requestJson('/api/v1/corpora');
  }

  /** Get information about a given Corpus. */
  getCorpus(corpusId: string): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}`);
  }

  /** Create a new Corpus. */
  createCorpus(name?: string, description?: string): Promise<Jsonifiable> {
    const body = {
      corpus: {
        display_name: name,
        description,
      },
    };
    return this.requestJson('/api/v1/corpora', body);
  }

  /** Query a given Corpus. */
  queryCorpus(corpusId: string, query: string, maxChunks?: number): Promise<Jsonifiable> {
    const body = {
      corpus_id: corpusId,
      query,
      max_chunks: maxChunks,
    };
    return this.requestJson(`/api/v1/corpora/${corpusId}:query`, body);
  }

  /** List the Sources in a given Corpus. */
  listCorpusSources(corpusId: string): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources`);
  }

  /** Get information about a given Source. */
  getCorpusSource(corpusId: string, sourceId: string): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources/${sourceId}`);
  }

  /** Add a new Source to a Corpus. */
  addCorpusSource(
    corpusId: string,
    startUrls: string[],
    includeGlobs?: string[],
    excludeGlobs?: string[],
    maxDocuments?: number,
    maxDepth?: number,
    description?: string
  ): Promise<Jsonifiable> {
    /**
     * Mike says Apify won't like the querystring and fragment, so we'll remove them.
     */
    const sanitizedStartUrls = startUrls.map((url) => {
      // Delete the query and fragment from the URL.
      const urlObj = new URL(url);
      urlObj.search = '';
      urlObj.hash = '';
      return urlObj.toString();
    });

    const body = {
      corpus_id: corpusId,
      source: {
        description,
        corpus_id: corpusId,
        load_spec: {
          max_documents: maxDocuments,
          web: {
            start_urls: sanitizedStartUrls,
            max_depth: maxDepth,
            include_glob_patterns: includeGlobs,
            exclude_glob_patterns: excludeGlobs,
          },
        },
      },
    };
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources`, body);
  }

  /**
   * Delete a given Source.
   *
   * The source must have no running jobs and no remaining documents. Use clearCorpusSource() to remove all documents.
   */
  deleteCorpusSource(corpusId: string, sourceId: string): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources/${sourceId}`, undefined, 'DELETE');
  }

  /**
   * Refresh the given Source.
   *
   * If a job is already running on this source, and force = false, this call will return an error.
   * If a job is already running on this source, and force = true, that job will be killed and restarted.
   */
  refreshCorpusSource(corpusId: string, sourceId: string, force?: boolean): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources/${sourceId}:refresh`, { force });
  }

  /**
   * Clear the given Source, removing all its documents and their chunks.
   *
   * If a job is already running on this source, and force = false, this call will return an error.
   * If a job is already running on this source, and force = true, that job will be killed and restarted.
   */
  clearCorpusSource(corpusId: string, sourceId: string, force?: boolean): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources/${sourceId}:clear`, { force });
  }

  /** List Jobs associated with a given Source. */
  listCorpusSourceJobs(corpusId: string, sourceId: string): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources/${sourceId}/jobs`);
  }

  /** Get information about a given Job. */
  getCorpusSourceJob(corpusId: string, sourceId: string, jobId: string): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources/${sourceId}/jobs/${jobId}`);
  }

  /** List Documents in a given Corpus Source. */
  listCorpusSourceDocs(corpusId: string, sourceId: string): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources/${sourceId}/documents`);
  }

  /** Get information about a given Document. */
  getCorpusSourceDoc(corpusId: string, sourceId: string, docId: string): Promise<Jsonifiable> {
    return this.requestJson(`/api/v1/corpora/${corpusId}/sources/${sourceId}/documents/${docId}`);
  }

  /**
   * @experimental this API may change at any time.
   *
   * Start a new conversation with an agent, optionally sending the initial message. (If you don't send the initial
   * message, the agent may.)
   *
   * @returns { conversationIdHeaderValue, response }
   *    conversationIdHeaderValue: The conversation ID, which can be used with the other API methods to continue the
   *                               conversation.
   *    response: The fetch response. The response will be a stream of newline-delimited JSON objects, each of which be
   *              of the shape ConversationTurn. Each member of the stream is the latest value of the turn as the agent
   *              streams its response. So, if you're driving a UI with this response, you always want to render the
   *              most recently emitted value from the stream.
   *
   *          If the generation is stopped via the stopGeneration() API, the final value emitted from the stream will be
   *          the same as what's persisted to the conversation history. However, intermediate stream values may include
   *          extra content that then disappears. For example:
   *
   *            Stream entry 0: text: hello wor
   *            <the stop occurs>
   *            Stream entry 1: text: hello world I am
   *            Stream entry 2: text: hello world
   *
   * @see sendMessage
   * @see stopGeneration
   * @see regenerate
   */
  async startConversation(agentId: AgentId, generationParams: MessageGenerationParams, message?: string) {
    const abortController = new AbortController();
    const signal = abortController.signal;
    console.log('Initiating startConversation request');
    const conversation = await this.request(
      `/api/v1/agents/${agentId}/conversations`,
      { generationParams, message },
      'POST',
      { signal }
    );

    if (!conversation.body) {
      throw new Error('Request to start a new conversation was empty');
    }
    if (conversation.status === 404) {
      console.log(`Agent ${agentId} does not exist, or is private.`);
      throw new AgentDoesNotExistError(`Agent ${agentId} does not exist, or is private.`);
    }
    if (!conversation.ok) {
      throw new Error(
        `Starting a new conversation failed: ${conversation.status} ${
          conversation.statusText
        } ${await conversation.text()}`
      );
    }

    const headerName = 'X-Fixie-Conversation-Id';
    const conversationIdHeaderValue = conversation.headers.get(headerName);
    if (!conversationIdHeaderValue) {
      throw new Error(`Fixie bug: Fixie backend did not return the "${headerName}" header.`);
    }
    return { conversationIdHeaderValue, response: conversation };
  }

  /**
   * @experimental this API may change at any time.
   *
   * Send a message to a conversation. If the conversationId does not refer to a conversation that already exists,
   * this will throw an error.
   *
   * @returns a fetch response. The response will be a stream of newline-delimited JSON objects, each of which will be
   *          of shape AssistantConversationTurn. Each member of the stream is the latest value of the turn as the agent
   *          streams its response. So, if you're driving a UI with this response, you always want to render the
   *          most recently emitted value from the stream.
   *
   *          If the generation is stopped via the stopGeneration() API, the final value emitted from the stream will be
   *          the same as what's persisted to the conversation history. However, intermediate stream values may include
   *          extra content that then disappears. For example:
   *
   *            Stream entry 0: text: hello wor
   *            <the stop occurs>
   *            Stream entry 1: text: hello world I am
   *            Stream entry 2: text: hello world
   *
   * @see startConversation
   */
  sendMessage(agentId: AgentId, conversationId: ConversationId, message: MessageRequestParams) {
    return this.request(`/api/v1/agents/${agentId}/conversations/${conversationId}/messages`, message);
  }

  /**
   * @experimental this API may change at any time.
   *
   * Stop a message that is currently being generated.
   */
  stopGeneration(agentId: AgentId, conversationId: ConversationId, messageId: string) {
    return this.request(
      `/api/v1/agents/${agentId}/conversations/${conversationId}/messages/${messageId}/stop`,
      undefined,
      'POST'
    );
  }

  /**
   * @experimental this API may change at any time.
   *
   * Regenerate a message that has already been generated. If `messageId` is not the most recent message in the
   * conversation, this request will fail.
   *
   * @returns a fetch response. The response will be a stream of newline-delimited JSON objects, each of which will be
   *          of shape AssistantConversationTurn. Each member of the stream is the latest value of the turn as the agent
   *          streams its response. So, if you're driving a UI with this response, you always want to render the
   *          most recently emitted value from the stream.
   *
   *          If the generation is stopped via the stopGeneration() API, the final value emitted from the stream will be
   *          the same as what's persisted to the conversation history. However, intermediate stream values may include
   *          extra content that then disappears. For example:
   *
   *            Stream entry 0: text: hello wor
   *            <the stop occurs>
   *            Stream entry 1: text: hello world I am
   *            Stream entry 2: text: hello world
   */
  regenerate(
    agentId: AgentId,
    conversationId: ConversationId,
    messageId: string,
    messageGenerationParams: MessageGenerationParams
  ) {
    return this.request(`/api/v1/agents/${agentId}/conversations/${conversationId}/messages/${messageId}/regenerate`, {
      generationParams: messageGenerationParams,
    });
  }
}
