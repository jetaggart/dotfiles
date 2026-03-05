---
name: react
description: React and TypeScript conventions for components, hooks, and patterns
invoke: auto
globs:
  - "**/*.tsx"
  - "**/*.jsx"
---

<component_structure>
- One component per file, named to match the file
- Use function declarations for components
- Destructure props in the function signature
- Define props as `{ComponentName}Props` interface above the component
- Split components that exceed ~150 lines

<example>
interface UserProfileProps {
  user: User
  onEdit: (id: string) => void
}

function UserProfile({ user, onEdit }: UserProfileProps) {
  return (...)
}
</example>
</component_structure>

<file_organization>
- Collocate related files: component, hooks, types, and styles live together
- Name files after what they export: `UserProfile.tsx`, `useAuth.ts`, `types.ts`
- Use barrel exports (`index.ts`) only at module boundaries
</file_organization>

<hooks>
- Extract shared stateful logic into custom hooks named after what they provide: `useUser`, `useFormValidation`
- Keep hooks focused on one concern
- Return objects for hooks with multiple values, tuples for simple state+setter pairs
- Use `useMemo` and `useCallback` when the value is passed as a prop or dependency, or when profiling shows a need

<example>
function useUser(id: string) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUser(id).then(setUser).finally(() => setLoading(false))
  }, [id])

  return { user, loading }
}
</example>
</hooks>

<state>
- Start with local state. Lift only when siblings need the same data.
- Use context for cross-cutting concerns (theme, auth, locale), not general state
- Derive values during render instead of syncing state with effects
- Use `useRef` for values that do not need to trigger renders
</state>

<props_and_types>
- Use TypeScript interfaces for props
- Use discriminated unions for variant components instead of boolean flags
- Keep prop surfaces small. Many props signals a component doing too much.
- Default prop values in the destructuring

<example>
interface AlertProps {
  variant: "success" | "error" | "warning"
  message: string
  dismissable?: boolean
}

function Alert({ variant, message, dismissable = true }: AlertProps) {
  return (...)
}
</example>
</props_and_types>

<patterns>
- Composition over configuration: combine small components instead of one component with many props
- Use early returns for conditional rendering instead of nested ternaries
- Handle loading, error, and empty states explicitly
- Colocate data fetching with the component that needs it
- Use controlled components for forms

<example>
function UserList({ users, loading, error }: UserListProps) {
  if (loading) return <Spinner />
  if (error) return <ErrorMessage error={error} />
  if (users.length === 0) return <EmptyState message="No users found" />

  return (
    <ul>
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </ul>
  )
}
</example>
</patterns>

<performance>
- Profile before optimizing
- Use `React.memo` for components that re-render often with unchanged props
- Define objects and arrays outside JSX props when passed to memoized children
- Lazy load routes and heavy components with `React.lazy` + `Suspense`
- Use stable, unique identifiers for `key` props
</performance>

<styling>
- Match whatever styling approach the project already uses
- Colocate styles with their components
- Use CSS variables for theming values
</styling>

<testing>
- Test behavior and user interactions, not implementation details
- Query by role, label, or text content
- Mock at the network boundary, not internal modules
</testing>
