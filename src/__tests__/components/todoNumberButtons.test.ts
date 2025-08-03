/**
 * 🔴 Red Phase: TODO番号ボタンの表示テスト
 * TDD開発: 1-10の番号ボタンを表示する機能のテスト
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createTodoNumberButtons } from '../../components/classificationResultEmbed';

describe('🔴 Red Phase: TODO番号ボタンの表示テスト', () => {
  test('TODO一覧表示時に1-10の番号ボタンが2行で表示される', () => {
    // Arrange
    const todoCount = 10;
    
    // Act
    const buttonRows = createTodoNumberButtons(todoCount);
    
    // Assert
    expect(buttonRows).toHaveLength(2); // 2行のActionRow
    
    // 1行目: 1-5
    const firstRow = buttonRows[0];
    expect(firstRow.components).toHaveLength(5);
    const firstButton = firstRow.components[0] as ButtonBuilder;
    expect((firstButton.data as any).label).toBe('1');
    expect((firstButton.data as any).custom_id).toBe('todo_number_1');
    expect(firstButton.data.style).toBe(ButtonStyle.Secondary);
    const fifthButton = firstRow.components[4] as ButtonBuilder;
    expect((fifthButton.data as any).label).toBe('5');
    expect((fifthButton.data as any).custom_id).toBe('todo_number_5');
    
    // 2行目: 6-10
    const secondRow = buttonRows[1];
    expect(secondRow.components).toHaveLength(5);
    const sixthButton = secondRow.components[0] as ButtonBuilder;
    expect((sixthButton.data as any).label).toBe('6');
    expect((sixthButton.data as any).custom_id).toBe('todo_number_6');
    const tenthButton = secondRow.components[4] as ButtonBuilder;
    expect((tenthButton.data as any).label).toBe('10');
    expect((tenthButton.data as any).custom_id).toBe('todo_number_10');
  });

  test('TODOが5件の場合、番号ボタンは1行で1-5まで表示される', () => {
    // Arrange
    const todoCount = 5;
    
    // Act
    const buttonRows = createTodoNumberButtons(todoCount);
    
    // Assert
    expect(buttonRows).toHaveLength(1); // 1行のActionRow
    
    const firstRow = buttonRows[0];
    expect(firstRow.components).toHaveLength(5);
    const firstButton = firstRow.components[0] as ButtonBuilder;
    expect((firstButton.data as any).label).toBe('1');
    const lastButton = firstRow.components[4] as ButtonBuilder;
    expect((lastButton.data as any).label).toBe('5');
  });

  test('TODOが7件の場合、番号ボタンは2行で1-7まで表示される', () => {
    // Arrange
    const todoCount = 7;
    
    // Act
    const buttonRows = createTodoNumberButtons(todoCount);
    
    // Assert
    expect(buttonRows).toHaveLength(2); // 2行のActionRow
    
    // 1行目: 1-5
    const firstRow = buttonRows[0];
    expect(firstRow.components).toHaveLength(5);
    
    // 2行目: 6-7
    const secondRow = buttonRows[1];
    expect(secondRow.components).toHaveLength(2);
    const sixthButton = secondRow.components[0] as ButtonBuilder;
    expect((sixthButton.data as any).label).toBe('6');
    const seventhButton = secondRow.components[1] as ButtonBuilder;
    expect((seventhButton.data as any).label).toBe('7');
  });

  test('TODOが0件の場合、空の配列が返される', () => {
    // Arrange
    const todoCount = 0;
    
    // Act
    const buttonRows = createTodoNumberButtons(todoCount);
    
    // Assert
    expect(buttonRows).toHaveLength(0);
  });

  test('TODOが11件以上の場合でも、最大10個の番号ボタンのみ表示される', () => {
    // Arrange
    const todoCount = 15;
    
    // Act
    const buttonRows = createTodoNumberButtons(todoCount);
    
    // Assert
    expect(buttonRows).toHaveLength(2); // 2行のActionRow
    
    // ボタンの総数は10個
    const totalButtons = buttonRows.reduce((sum: number, row: ActionRowBuilder<ButtonBuilder>) => sum + row.components.length, 0);
    expect(totalButtons).toBe(10);
    
    // 最後のボタンは10番
    const lastRow = buttonRows[1];
    const lastButton = lastRow.components[lastRow.components.length - 1] as ButtonBuilder;
    expect((lastButton.data as any).label).toBe('10');
  });

  test('各番号ボタンには適切なカスタムIDが設定される', () => {
    // Arrange
    const todoCount = 3;
    
    // Act
    const buttonRows = createTodoNumberButtons(todoCount);
    
    // Assert
    const firstRow = buttonRows[0];
    const button1 = firstRow.components[0] as ButtonBuilder;
    const button2 = firstRow.components[1] as ButtonBuilder;
    const button3 = firstRow.components[2] as ButtonBuilder;
    expect((button1.data as any).custom_id).toBe('todo_number_1');
    expect((button2.data as any).custom_id).toBe('todo_number_2');
    expect((button3.data as any).custom_id).toBe('todo_number_3');
  });
});