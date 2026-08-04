import { useEffect, useRef } from 'react';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
}

/**
 * 静态浅色主题：颜色全部引用 CSS 变量，自动跟随设计 token。
 */
const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bg-editor)',
    color: 'var(--text-primary)',
    fontSize: '14px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-tertiary)',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--primary-bg)',
    color: 'var(--primary)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--bg-secondary)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--primary)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--primary-bg)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
  },
});

/**
 * SQL 语法高亮：与 SqlHighlight 共用同一组 --sql-* token，保证两处配色一致。
 */
const sqlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--sql-keyword)', fontWeight: '600' },
  { tag: tags.string, color: 'var(--sql-string)' },
  { tag: tags.number, color: 'var(--sql-number)' },
  { tag: tags.comment, color: 'var(--sql-comment)', fontStyle: 'italic' },
  { tag: tags.typeName, color: 'var(--sql-type)' },
  { tag: tags.function(tags.variableName), color: 'var(--sql-function)' },
  { tag: tags.propertyName, color: 'var(--sql-identifier)' },
  { tag: tags.operator, color: 'var(--text-secondary)' },
  { tag: tags.bool, color: 'var(--sql-keyword)' },
]);

export function SqlEditor({ value, onChange, onExecute }: SqlEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInitialized = useRef(false);
  // 用 ref 保持最新回调（避免 keymap/updateListener 捕获陈旧闭包）
  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 初始化编辑器（仅一次）
  useEffect(() => {
    if (!editorRef.current || isInitialized.current) return;

    const extensions = [
      sql({ dialect: PostgreSQL }),
      placeholder('在这里输入 SQL 语句，例如：SELECT * FROM employees;'),
      keymap.of([
        {
          key: 'Ctrl-Enter',
          run: () => { onExecuteRef.current(); return true; },
        },
        {
          key: 'Mod-Enter',
          run: () => { onExecuteRef.current(); return true; },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      lightTheme,
      syntaxHighlighting(sqlHighlightStyle),
      EditorView.lineWrapping,
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    isInitialized.current = true;

    return () => {
      view.destroy();
      viewRef.current = null;
      isInitialized.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当外部 value 改变时同步到编辑器（如重置沙箱清空 SQL）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={editorRef}
      className="w-full h-full overflow-auto border-b border-[var(--border-color)]"
    />
  );
}
