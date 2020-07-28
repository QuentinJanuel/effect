import { pipe } from "../../Function"
import { sequential } from "../Effect"
import { FiberContext } from "../Fiber"
import { interrupt } from "../Fiber/interrupt"

import * as T from "./deps"
import { Managed } from "./managed"
import { makeReleaseMap, ReleaseMap } from "./releaseMap"

/**
 * A more powerful version of `foldM` that allows recovering from any kind of failure except interruptions.
 */
export const fork = <S, R, E, A>(
  self: Managed<S, R, E, A>
): Managed<unknown, R, never, FiberContext<E, A>> =>
  new Managed(
    T.uninterruptibleMask(({ restore }) =>
      pipe(
        T.of,
        T.bind("tp", () => T.environment<[R, ReleaseMap]>()),
        T.let("r", ({ tp }) => tp[0]),
        T.let("outerReleaseMap", ({ tp }) => tp[1]),
        T.bind("innerReleaseMap", () => makeReleaseMap),
        T.bind("fiber", ({ innerReleaseMap, r }) =>
          restore(
            pipe(
              self.effect,
              T.map(([_, a]) => a),
              T.forkDaemon,
              T.provideAll([r, innerReleaseMap] as [R, ReleaseMap])
            )
          )
        ),
        T.bind("releaseMapEntry", ({ fiber, innerReleaseMap, outerReleaseMap }) =>
          outerReleaseMap.add((e) =>
            pipe(
              fiber,
              interrupt,
              T.chain(() => innerReleaseMap.releaseAll(e, sequential))
            )
          )
        ),
        T.map(({ fiber, releaseMapEntry }) => [releaseMapEntry, fiber])
      )
    )
  )
