import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>;
  };
};

export function navigateWithPageTransition(
  navigate: NavigateFunction,
  to: To,
  options?: NavigateOptions,
) {
  const transitionDocument = document as ViewTransitionDocument;
  if (!transitionDocument.startViewTransition) {
    navigate(to, options);
    return;
  }

  transitionDocument.startViewTransition(() => {
    navigate(to, options);
  });
}
