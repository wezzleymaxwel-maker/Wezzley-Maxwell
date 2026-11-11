export const boardRows = [
  ['caatinga', 'barreiro', 'serrote'],
  ['rocado', 'pastagem', 'caatinga', 'barreiro'],
  ['serrote', 'rocado', 'terra-seca', 'pastagem', 'caatinga'],
  ['barreiro', 'pastagem', 'rocado', 'serrote'],
  ['caatinga', 'pastagem', 'rocado'],
] as const;

export type MapSize='classic'|'double';
export const rowLengths=(size:MapSize='classic')=>size==='double'?[6,7,8,9,8]:[3,4,5,4,3];
