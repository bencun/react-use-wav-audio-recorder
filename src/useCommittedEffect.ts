import { useEffect, useLayoutEffect } from 'react';

export const useCommittedEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
