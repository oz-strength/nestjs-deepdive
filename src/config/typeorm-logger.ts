import { Logger as NestLogger } from '@nestjs/common';
import { Logger, QueryRunner } from 'typeorm';
import { format } from 'sql-formatter';

const R = '\x1b[0m';
const KEYWORD = '\x1b[1m\x1b[38;2;86;182;194m';  // bold + 하늘색
const STRING  = '\x1b[38;2;152;195;121m';          // 연두색
const IDENT   = '\x1b[38;2;180;180;180m';          // 밝은 회색
const PARAM   = '\x1b[38;2;255;203;107m';          // 노란색
const GRAY    = '\x1b[38;2;100;100;100m';           // 어두운 회색

const KEYWORDS =
  /\b(SELECT|DISTINCT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|INSERT INTO|VALUES|UPDATE|SET|DELETE|RETURNING|WITH|UNION|ALL|EXISTS|CASE|WHEN|THEN|ELSE|END|START TRANSACTION|COMMIT|ROLLBACK|CREATE|DROP|ALTER|TABLE|INDEX)\b/g;

function colorize(sql: string): string {
  return (
    sql
      .replace(/"[^"]*"/g, (m) => `${IDENT}${m}${R}`)
      .replace(/'[^']*'/g, (m) => `${STRING}${m}${R}`)
      .replace(KEYWORDS, `${KEYWORD}$1${R}`)
      .replace(/\$\d+/g, (m) => `${PARAM}${m}${R}`) +
    R
  );
}

export class PrettyLogger implements Logger {
  private readonly logger = new NestLogger('TypeORM');

  private pretty(query: string, parameters?: unknown[]): string {
    let formatted: string;
    try {
      formatted = format(query, { language: 'postgresql', tabWidth: 2 });
    } catch {
      formatted = query;
    }

    let out = '\n' + colorize(formatted);
    if (parameters?.length) {
      out += `\n${GRAY}-- PARAMETERS: ${JSON.stringify(parameters)}${R}`;
    }
    return out;
  }

  logQuery(query: string, parameters?: unknown[], _runner?: QueryRunner) {
    this.logger.log(this.pretty(query, parameters));
  }

  logQueryError(error: string | Error, query: string, parameters?: unknown[], _runner?: QueryRunner) {
    this.logger.error(this.pretty(query, parameters));
    this.logger.error(error instanceof Error ? error.message : error);
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[], _runner?: QueryRunner) {
    this.logger.warn(`[SLOW ${time}ms]${this.pretty(query, parameters)}`);
  }

  logSchemaBuild(message: string) {
    this.logger.log(message);
  }

  logMigration(message: string) {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown) {
    if (level === 'warn') this.logger.warn(message);
    else this.logger.log(message);
  }
}
