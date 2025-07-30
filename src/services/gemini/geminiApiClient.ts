/**
 * Gemini API クライアント
 * Google Gemini API への低レベル通信を担当
 */

import { GoogleGenerativeAI, GenerativeModel, GenerateContentResult } from '@google/generative-ai';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Gemini API クライアントインターフェース
 */
export interface IGeminiApiClient {
  /**
   * テスト生成 - プロンプトを送信してレスポンスを取得
   * @param prompt 送信するプロンプト
   * @returns Gemini APIからのレスポンス
   */
  generateContent(prompt: string): Promise<GenerateContentResult>;

  /**
   * トークン数を推定（概算）
   * @param text 対象テキスト
   * @returns 推定トークン数
   */
  estimateTokens(text: string): number;
}

/**
 * GeminiApiClient の実装
 * 単一責任: Google Gemini API との低レベル通信
 */
export class GeminiApiClient implements IGeminiApiClient {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor() {
    // Gemini API の初期化
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: config.gemini.model,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });

    logger.info('GEMINI_API', '✅ GeminiApiClient が初期化されました');
  }

  /**
   * テスト生成 - プロンプトを送信してレスポンスを取得
   */
  async generateContent(prompt: string): Promise<GenerateContentResult> {
    return await this.model.generateContent(prompt);
  }

  /**
   * テキストのトークン数を推定（概算）
   */
  estimateTokens(text: string): number {
    // 大まかな推定：日本語は1文字約1.5トークン、英語は4文字約1トークン
    const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
    const otherChars = text.length - japaneseChars;
    return Math.ceil(japaneseChars * 1.5 + otherChars / 4);
  }
}