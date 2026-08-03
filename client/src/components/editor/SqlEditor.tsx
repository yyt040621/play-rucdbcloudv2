import { useEffect, useRef } from 'react';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { sql, MySQL } from '@codemirror/lang-sql';
import { oneDarkTheme } from '@codemirror/theme-one-dark';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  theme: 'light' | 'dark';
}

// 用 Compartment 包裹主题扩展，使 theme 切换时不需要重建编辑器
const themeCompartment = new Compartment();

/**
 * 根据 theme 返回主题扩展数组
 */
function getThemeExtensions(theme: 'light' | 'dark') {
  const exts = [
    EditorView.theme({
      '&': {
        backgroundColor: theme === 'dark' ? '#11111B' : '#FAFAFA',
        color: theme === 'dark' ? '#CDD6F4' : '#1F2937',
        fontSize: '14px',
      },
      '.cm-gutters': {
        backgroundColor: theme === 'dark' ? '#181825' : '#F3F4F6',
        color: theme === 'dark' ? '#6C7086' : '#9CA3AF',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: theme === 'dark' ? '#252540' : '#E5E7EB',
      },
      '.cm-activeLine': {
        backgroundColor: theme === 'dark' ? '#1E1E2E33' : '#F3F4F633',
      },
      '.cm-cursor': {
        borderLeftColor: theme === 'dark' ? '#89B4FA' : '#3B82F6',
      },
      '.cm-selectionBackground': {
        backgroundColor: theme === 'dark' ? '#45475A66' : '#BFDBFE66',
      },
      '.cm-tooltip': {
        backgroundColor: theme === 'dark' ? '#313244' : '#FFFFFF',
        color: theme === 'dark' ? '#CDD6F4' : '#1F2937',
        border: `1px solid ${theme === 'dark' ? '#45475A' : '#E5E7EB'}`,
      },
    }),
  ];

  if (theme === 'dark') {
    exts.push(oneDarkTheme);
  }

  return exts;
}

export function SqlEditor({ value, onChange, onExecute, theme }: SqlEditorProps) {
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
      sql({ dialect: MySQL }),
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
      themeCompartment.of(getThemeExtensions(theme)),
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

  // theme 切换：只重配置 theme compartment，不重建编辑器
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtensions(theme)),
    });
  }, [theme]);

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
