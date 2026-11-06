import { Renderable } from "@opentui/core"
import { createMemo, createRenderEffect, createRoot, getOwner, omit, runWithOwner, untrack } from "solid-js"
import {
  createSlotNode,
  createElement,
  insert,
  removeNode,
  spread,
  RenderableContext,
  type DomNode,
} from "../reconciler.js"
import type { JSX } from "../../jsx-runtime.js"
import type { ValidComponent, ComponentProps } from "solid-js"
import { useRenderer } from "./hooks.js"

/**
 * Renders components somewhere else in the DOM
 *
 * Useful for inserting modals and tooltips outside of an cropping layout. If no mount point is given, the portal is inserted on the root renderable; it is wrapped in a `<box>`
 *
 * Native portals can switch scenes only while their container is empty. A rejected switch preserves
 * the mounted tree and its subscriptions; existing nodes are never remounted implicitly.
 *
 * @description https://docs.solidjs.com/reference/components/portal
 */
export function Portal(props: { mount?: DomNode; ref?: (el: {}) => void; children: JSX.Element }): JSX.Element {
  const renderer = useRenderer()

  const marker = createSlotNode()
  let container: DomNode | undefined

  // Validate the next mount before the insertion effect cleans up the current one.
  const mount = createMemo(() => {
    const el = props.mount || renderer.root
    const scene = el instanceof Renderable ? el.ctx.nativeScene : renderer.nativeScene
    const currentScene = container instanceof Renderable ? container.ctx.nativeScene : renderer.nativeScene
    if (container && scene !== currentScene && container.getChildrenCount() !== 0) {
      throw new Error("Cannot retarget a Portal with existing nodes between native scenes")
    }
    return el
  })
  const context = () => {
    // Read pending mounts synchronously without subscribing JSX creation to future target changes.
    const el = untrack(mount)
    return el instanceof Renderable && el.ctx.nativeScene !== renderer.nativeScene ? el.ctx : renderer
  }
  const content = RenderableContext({
    value: context,
    get children() {
      return props.children
    },
  }) as unknown as () => JSX.Element

  createRenderEffect(
    () => [mount(), getOwner()] as const,
    ([el, owner]) => {
      const dispose = runWithOwner(owner, () =>
        createRoot((dispose) => {
          const nextContainer = (
            RenderableContext({
              value: context,
              get children() {
                return createElement("box")
              },
            }) as unknown as () => DomNode
          )()

          Object.defineProperty(nextContainer, "_$host", {
            get() {
              return marker.parent
            },
            configurable: true,
          })
          insert(nextContainer, content)
          el.add(nextContainer)
          container = nextContainer
          props.ref && (props as any).ref(nextContainer)
          return () => {
            dispose()
            removeNode(el, nextContainer)
          }
        }),
      )
      return dispose
    },
    { schedule: true },
  )
  // The reconciler consumes this marker as the runtime representation of the portal JSX node.
  return marker as unknown as JSX.Element
}

export type DynamicProps<T extends ValidComponent, P = ComponentProps<T>> = {
  [K in keyof P]: P[K]
} & {
  component: T | undefined
}

/**
 * Renders an arbitrary component or element with the given props
 *
 * This is a lower level version of the `Dynamic` component, useful for
 * performance optimizations in libraries. Do not use this unless you know
 * what you are doing.
 * ```typescript
 * const element = () => multiline() ? 'textarea' : 'input';
 * createDynamic(element, { value: value() });
 * ```
 * @description https://docs.solidjs.com/reference/components/dynamic
 */
export function createDynamic<T extends ValidComponent>(
  component: () => T | undefined,
  props: ComponentProps<T>,
): JSX.Element {
  const cached = createMemo<Function | string | undefined>(component)
  return createMemo(() => {
    const component = cached()
    switch (typeof component) {
      case "function":
        // if (isDev) Object.assign(component, { [$DEVCOMP]: true })
        return untrack(() => component(props))

      case "string":
        const el = createElement(component)
        spread(el, props)
        return el

      default:
        break
    }
  }) as unknown as JSX.Element
}

/**
 * Renders an arbitrary custom or native component and passes the other props
 * ```typescript
 * <Dynamic component={multiline() ? 'textarea' : 'input'} value={value()} />
 * ```
 * @description https://docs.solidjs.com/reference/components/dynamic
 */
export function Dynamic<T extends ValidComponent>(props: DynamicProps<T>): JSX.Element {
  return createDynamic(() => props.component, omit(props, "component") as ComponentProps<T>)
}
