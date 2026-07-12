import path from 'node:path';

export function resolvePath(value) {
  return path.resolve(value);
}

export function parseInteger(value) {
  return Number.parseInt(value, 10);
}

export function parseArgs(argv, defaults, flags) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = flags[argv[index]];
    if (flag && argv[index + 1] !== undefined) {
      options[flag.key] = flag.parse ? flag.parse(argv[index + 1]) : argv[index + 1];
      index += 1;
    }
  }
  return options;
}
