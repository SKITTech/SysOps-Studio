export interface TableDef {
  name: string;
  columns: Map<string, ColumnDef>;
  indexes: string[];
  engine?: string;
  charset?: string;
  rawCreate: string;
}

export interface ColumnDef {
  name: string;
  definition: string; // full column definition line
}

export interface TableDiff {
  tableName: string;
  type: 'missing_table' | 'extra_columns' | 'missing_columns' | 'modified_columns' | 'mixed';
  details: string[];
  fixSQL: string;
}

function parseTables(sql: string): Map<string, TableDef> {
  const tables = new Map<string, TableDef>();
  
  // Match CREATE TABLE blocks
  const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*(ENGINE[^;]*|[^;]*)?;/gi;
  let match: RegExpExecArray | null;

  while ((match = createRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const suffix = match[3] || '';
    
    const columns = new Map<string, ColumnDef>();
    const indexes: string[] = [];
    
    // Split body by lines, handle commas carefully
    const lines = body.split('\n').map(l => l.trim()).filter(l => l);
    
    for (const line of lines) {
      const cleanLine = line.replace(/,\s*$/, '').trim();
      if (!cleanLine) continue;
      
      // Check if it's an index/key/constraint
      if (/^(PRIMARY\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY)/i.test(cleanLine)) {
        indexes.push(cleanLine);
      } else {
        // It's a column definition
        const colMatch = cleanLine.match(/^[`"]?(\w+)[`"]?\s+(.+)$/);
        if (colMatch) {
          columns.set(colMatch[1].toLowerCase(), {
            name: colMatch[1],
            definition: cleanLine,
          });
        }
      }
    }
    
    tables.set(tableName.toLowerCase(), {
      name: tableName,
      columns,
      indexes,
      rawCreate: match[0],
      engine: suffix,
    });
  }
  
  return tables;
}

export function compareDatabases(originalSQL: string, errorSQL: string): TableDiff[] {
  const originalTables = parseTables(originalSQL);
  const errorTables = parseTables(errorSQL);
  const diffs: TableDiff[] = [];

  // Find missing tables (in original but not in error)
  for (const [key, origTable] of originalTables) {
    if (!errorTables.has(key)) {
      diffs.push({
        tableName: origTable.name,
        type: 'missing_table',
        details: [`Table \`${origTable.name}\` is completely missing`],
        fixSQL: origTable.rawCreate,
      });
      continue;
    }

    const errTable = errorTables.get(key)!;
    const details: string[] = [];
    const fixStatements: string[] = [];

    // Find missing columns
    for (const [colKey, origCol] of origTable.columns) {
      if (!errTable.columns.has(colKey)) {
        details.push(`Missing column: \`${origCol.name}\``);
        fixStatements.push(`ALTER TABLE \`${origTable.name}\` ADD COLUMN ${origCol.definition};`);
      } else {
        // Check if definition differs
        const errCol = errTable.columns.get(colKey)!;
        const normOrig = origCol.definition.replace(/\s+/g, ' ').toLowerCase();
        const normErr = errCol.definition.replace(/\s+/g, ' ').toLowerCase();
        if (normOrig !== normErr) {
          details.push(`Modified column: \`${origCol.name}\` — expected: \`${origCol.definition}\``);
          fixStatements.push(`ALTER TABLE \`${origTable.name}\` MODIFY COLUMN ${origCol.definition};`);
        }
      }
    }

    // Find extra columns (in error but not in original)
    for (const [colKey, errCol] of errTable.columns) {
      if (!origTable.columns.has(colKey)) {
        details.push(`Extra column (not in original): \`${errCol.name}\``);
        fixStatements.push(`ALTER TABLE \`${origTable.name}\` DROP COLUMN \`${errCol.name}\`;`);
      }
    }

    // Find missing indexes
    for (const origIdx of origTable.indexes) {
      const normOrig = origIdx.replace(/\s+/g, ' ').toLowerCase();
      const found = errTable.indexes.some(ei => ei.replace(/\s+/g, ' ').toLowerCase() === normOrig);
      if (!found) {
        details.push(`Missing index/key: ${origIdx}`);
        fixStatements.push(`ALTER TABLE \`${origTable.name}\` ADD ${origIdx};`);
      }
    }

    if (details.length > 0) {
      diffs.push({
        tableName: origTable.name,
        type: details.length === 1 
          ? (details[0].startsWith('Missing column') ? 'missing_columns' 
            : details[0].startsWith('Extra') ? 'extra_columns' 
            : 'modified_columns')
          : 'mixed',
        details,
        fixSQL: fixStatements.join('\n'),
      });
    }
  }

  // Tables in error but not in original (extra tables)
  for (const [key, errTable] of errorTables) {
    if (!originalTables.has(key)) {
      diffs.push({
        tableName: errTable.name,
        type: 'extra_columns',
        details: [`Extra table \`${errTable.name}\` exists but is not in the original structure`],
        fixSQL: `DROP TABLE IF EXISTS \`${errTable.name}\`;`,
      });
    }
  }

  return diffs;
}
