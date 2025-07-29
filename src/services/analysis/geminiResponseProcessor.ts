/**
 * Gemini レスポンスプロセッサー
 * Gemini API レスポンスの解析・JSON修復・型変換を担当
 */

import {
  GeminiAnalysisResponse,
  CategorySummary,
  TimelineEntry,
  TimeDistribution,
  AnalysisInsight,
  AnalysisWarning,
  WarningType,
  WarningLevel,
  ActivityLogError
} from '../../types/activityLog';

/**
 * レスポンスプロセッサーインターフェース
 */
export interface IGeminiResponseProcessor {
  /**
   * Geminiレスポンスをパース
   * @param responseText レスポンステキスト
   * @returns パース済みの分析レスポンス
   */
  parseGeminiResponse(responseText: string): GeminiAnalysisResponse;
}

/**
 * GeminiResponseProcessor の実装
 * 単一責任: Gemini API レスポンスの解析と修復
 */
export class GeminiResponseProcessor implements IGeminiResponseProcessor {
  /**
   * Geminiレスポンスをパース
   */
  parseGeminiResponse(responseText: string): GeminiAnalysisResponse {
    try {
      // JSONのみを抽出
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      let jsonText = jsonMatch ? jsonMatch[0] : responseText;
      
      // 不完全なJSONの修復を試行
      if (!jsonText.trim().endsWith('}')) {
        console.log('🔧 不完全なJSONの修復を試行...');
        jsonText = this.repairIncompleteJson(jsonText);
      }
      
      const parsed = JSON.parse(jsonText);
      
      return this.validateAndNormalizeResponse(parsed);
    } catch (error) {
      console.error('❌ Geminiレスポンスパースエラー:', error);
      throw new ActivityLogError('分析結果の解析に失敗しました', 'PARSE_RESPONSE_ERROR', { error, responseText });
    }
  }

  /**
   * 不完全なJSONの修復を試行
   */
  private repairIncompleteJson(jsonText: string): string {
    try {
      let repaired = jsonText.trim();
      
      // 引用符が途中で終わっている場合を修復
      if (repaired.endsWith('"')) {
        // 最後の不完全な値を削除
        const lastCommaIndex = repaired.lastIndexOf(',');
        const lastColonIndex = repaired.lastIndexOf(':');
        
        if (lastColonIndex > lastCommaIndex) {
          // 最後のプロパティが不完全
          repaired = repaired.substring(0, lastCommaIndex > 0 ? lastCommaIndex : repaired.lastIndexOf('{'));
        }
      }
      
      // 配列やオブジェクトの途中で終わっている場合を修復
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escaped = false;
      
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        
        if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
          else if (char === '"') inString = true;
        } else {
          if (char === '"' && !escaped) inString = false;
          escaped = char === '\\' && !escaped;
        }
      }
      
      // 必要な閉じ括弧を追加
      repaired += ']'.repeat(openBrackets);
      repaired += '}'.repeat(openBraces);
      
      console.log(`🔧 JSON修復完了: ${repaired.length}文字`);
      return repaired;
      
    } catch (error) {
      console.error('❌ JSON修復失敗:', error);
      // 修復できない場合は最小限の有効なJSONを返す
      return this.getMinimumValidJson();
    }
  }

  /**
   * レスポンスを検証・正規化
   */
  private validateAndNormalizeResponse(parsed: any): GeminiAnalysisResponse {
    return {
      categories: this.validateCategories(parsed.categories || []),
      timeline: this.validateTimeline(parsed.timeline || []),
      timeDistribution: this.validateTimeDistribution(parsed.timeDistribution),
      insights: this.validateInsights(parsed.insights),
      warnings: this.validateWarnings(parsed.warnings || []),
      confidence: this.validateConfidence(parsed.confidence)
    };
  }

  /**
   * カテゴリ配列を検証・正規化
   */
  private validateCategories(categories: any[]): CategorySummary[] {
    return categories
      .filter(cat => cat && typeof cat === 'object')
      .map(cat => ({
        category: String(cat.category || 'その他'),
        subCategory: cat.subCategory ? String(cat.subCategory) : undefined,
        estimatedMinutes: Math.max(0, Number(cat.estimatedMinutes) || 0),
        confidence: Math.min(1, Math.max(0, Number(cat.confidence) || 0.5)),
        logCount: Math.max(0, Number(cat.logCount) || 0),
        representativeActivities: Array.isArray(cat.representativeActivities) 
          ? cat.representativeActivities.map(String).slice(0, 5)
          : []
      }));
  }

  /**
   * タイムライン配列を検証・正規化
   */
  private validateTimeline(timeline: any[]): TimelineEntry[] {
    return timeline
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => ({
        startTime: this.validateISOString(entry.startTime),
        endTime: this.validateISOString(entry.endTime),
        category: String(entry.category || 'その他'),
        subCategory: entry.subCategory ? String(entry.subCategory) : undefined,
        content: String(entry.content || ''),
        confidence: Math.min(1, Math.max(0, Number(entry.confidence) || 0.5)),
        sourceLogIds: Array.isArray(entry.sourceLogIds) 
          ? entry.sourceLogIds.map(String)
          : []
      }))
      .filter(entry => entry.startTime && entry.endTime);
  }

  /**
   * 時間分布を検証・正規化
   */
  private validateTimeDistribution(timeDistribution: any): TimeDistribution {
    const td = timeDistribution || {};
    return {
      totalEstimatedMinutes: Math.max(0, Number(td.totalEstimatedMinutes) || 0),
      workingMinutes: Math.max(0, Number(td.workingMinutes) || 0),
      breakMinutes: Math.max(0, Number(td.breakMinutes) || 0),
      unaccountedMinutes: Math.max(0, Number(td.unaccountedMinutes) || 0),
      overlapMinutes: Math.max(0, Number(td.overlapMinutes) || 0)
    };
  }

  /**
   * 洞察を検証・正規化
   */
  private validateInsights(insights: any): AnalysisInsight {
    const ins = insights || {};
    const workBalance = ins.workBalance || {};
    
    return {
      productivityScore: Math.min(100, Math.max(0, Number(ins.productivityScore) || 70)),
      workBalance: {
        focusTimeRatio: Math.min(1, Math.max(0, Number(workBalance.focusTimeRatio) || 0.5)),
        meetingTimeRatio: Math.min(1, Math.max(0, Number(workBalance.meetingTimeRatio) || 0.2)),
        breakTimeRatio: Math.min(1, Math.max(0, Number(workBalance.breakTimeRatio) || 0.2)),
        adminTimeRatio: Math.min(1, Math.max(0, Number(workBalance.adminTimeRatio) || 0.1))
      },
      suggestions: Array.isArray(ins.suggestions) 
        ? ins.suggestions.map(String).slice(0, 5)
        : ['今日もお疲れさまでした！'],
      highlights: Array.isArray(ins.highlights) 
        ? ins.highlights.map(String).slice(0, 5)
        : ['一日の活動を記録できました'],
      motivation: String(ins.motivation || '明日も頑張りましょう！')
    };
  }

  /**
   * 警告配列を検証・正規化
   */
  private validateWarnings(warnings: any[]): AnalysisWarning[] {
    return warnings
      .filter(warning => warning && typeof warning === 'object')
      .map(warning => ({
        type: this.validateWarningType(warning.type),
        level: this.validateWarningLevel(warning.level),
        message: String(warning.message || ''),
        details: warning.details || {}
      }))
      .filter(warning => warning.message);
  }

  /**
   * 警告タイプを検証
   */
  private validateWarningType(type: any): WarningType {
    const validTypes: WarningType[] = [
      'time_overlap',
      'time_gap', 
      'inconsistent_input',
      'low_confidence',
      'excessive_work_time',
      'insufficient_breaks'
    ];
    return validTypes.includes(type) ? type : 'inconsistent_input';
  }

  /**
   * 警告レベルを検証
   */
  private validateWarningLevel(level: any): WarningLevel {
    return Object.values(WarningLevel).includes(level) ? level : WarningLevel.INFO;
  }

  /**
   * 信頼度を検証・正規化
   */
  private validateConfidence(confidence: any): number {
    return Math.min(1, Math.max(0, Number(confidence) || 0.7));
  }

  /**
   * ISO文字列を検証
   */
  private validateISOString(dateString: any): string {
    if (!dateString) return '';
    
    const str = String(dateString);
    try {
      // ISO形式の日時として解析可能かチェック
      new Date(str).toISOString();
      return str;
    } catch (error) {
      console.warn(`⚠️ 無効な日時文字列: ${str}`);
      return '';
    }
  }

  /**
   * 最小限の有効なJSONを取得
   */
  private getMinimumValidJson(): string {
    return JSON.stringify({
      categories: [],
      timeline: [],
      timeDistribution: {
        totalEstimatedMinutes: 0,
        workingMinutes: 0,
        breakMinutes: 0,
        unaccountedMinutes: 0,
        overlapMinutes: 0
      },
      insights: {
        productivityScore: 70,
        workBalance: {
          focusTimeRatio: 0.5,
          meetingTimeRatio: 0.2,
          breakTimeRatio: 0.2,
          adminTimeRatio: 0.1
        },
        suggestions: ['分析中にエラーが発生しました'],
        highlights: ['エラーが発生しました'],
        motivation: '分析中にエラーが発生しました'
      },
      warnings: [],
      confidence: 0.5
    });
  }
}