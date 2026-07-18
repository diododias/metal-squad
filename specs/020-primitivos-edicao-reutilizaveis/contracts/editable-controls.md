# Internal UI Contract: Editable Controls

These are internal React component contracts under
`src/web/client/components/core/`; they are not a server, WebSocket, CLI, or
backlog-schema contract.

## Shared expectations

- Every primitive is controlled: the parent supplies `value` and updates it in
  response to `onChange`.
- Every primitive also receives `initialValue` and derives `isDirty` from the
  typed values. It must not retain dirty state.
- `disabled` defaults to `false`, prevents the native interaction, and leaves
  the label, received value, missing-value hint, and dirty indicator legible.
- The component creates or accepts an id so the `<label>` is associated with its
  field. The dirty indicator is exposed as readable text, not color alone.
- Components do not import backlog, database, server, WebSocket, or patch types.

## `EditableTextField`

```ts
interface EditableTextFieldProps {
  label: string;
  value: string | undefined;
  initialValue: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  missingValueLabel?: string;
}
```

## `EditableSelectField`

```ts
interface EditableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface EditableSelectFieldProps {
  label: string;
  value: string | undefined;
  initialValue: string | undefined;
  options: readonly EditableSelectOption[];
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  id?: string;
  missingValueLabel?: string;
}
```

If `value` is non-empty but absent from `options`, the rendered select retains a
disabled, clearly unavailable current option. The parent decides how to repair
or persist that value.

## `EditableToggleField`

```ts
interface EditableToggleFieldProps {
  label: string;
  value: boolean | undefined;
  initialValue: boolean | undefined;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  id?: string;
  missingValueLabel?: string;
}
```

For an undefined value, render a stable not-configured presentation and do not
pretend it is an unchecked boolean.

## `EditableFieldShell`

The shell is internal to the three primitives. It owns layout, label, optional
hint, and the visible modified marker; it accepts already-derived `isDirty` and
does not calculate values or emit changes.
