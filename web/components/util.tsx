export function isSubset(subset: object, main: object) {
  // If subset is not an object or is null, check equality
  if (typeof subset !== "object" || subset === null) {
    return subset === main;
  }

  // If main is not an object or is null, then it can't have subset as its subset
  if (typeof main !== "object" || main === null) {
    return false;
  }

  // Check each property of subset to see if it exists in main
  for (let key in subset) {
    if (!main.hasOwnProperty(key)) {
      return false;
    }
    /* @ts-ignore */
    if (!isSubset(subset[key], main[key])) {
      return false;
    }
  }

  return true;
}

export const isClient = () => typeof window !== "undefined";

export const setItem = (key: string, value: string) => {
  if (isClient()) {
    window.localStorage.setItem(key, value);
  }
};

export const getItem = (key: string) => {
  if (isClient()) {
    return window.localStorage.getItem(key);
  }
  return null;
};
