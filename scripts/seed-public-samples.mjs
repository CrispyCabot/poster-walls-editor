#!/usr/bin/env node
/**
 * Seeds a handful of PUBLIC sample projects owned by a fixed demo account.
 *
 * They exist so browsing can be exercised by someone who is not the author —
 * a signed-in user should see walls they did not make. The owner id is a
 * constant rather than a real Cognito sub, so nobody can sign in as it and the
 * samples cannot be edited through the app.
 *
 * Re-running replaces the same ids rather than piling up duplicates.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { execFileSync } from 'node:child_process';

const STACK = process.env.STACK_NAME ?? 'PosterWalls';

const TABLE =
  process.env.TABLE_NAME ??
  execFileSync(
    'aws',
    [
      'cloudformation', 'describe-stacks', '--stack-name', STACK,
      '--query', "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue",
      '--output', 'text',
    ],
    { encoding: 'utf8' },
  ).trim();

/** Not a Cognito sub. Nothing can authenticate as this, by design. */
const DEMO_OWNER = 'sample-gallery';
const NOW = new Date().toISOString();

const BLACK = '#000000';
const WHITE = '#FFFFFF';
const OAK = '#B98A56';
const WALNUT = '#5C4033';

/** Lays posters out in centred rows, so the samples look deliberate. */
function grid(wall, posters, rows) {
  const placements = [];
  let i = 0;
  const rowHeight = wall.heightIn / (rows.length + 1);

  rows.forEach((count, rowIndex) => {
    const inRow = posters.slice(i, i + count);
    i += count;
    const totalWidth = inRow.reduce((sum, p) => sum + p.widthIn + p.frameWidthIn * 2, 0);
    const gap = 4;
    const span = totalWidth + gap * (inRow.length - 1);
    let x = (wall.widthIn - span) / 2;
    const y = wall.heightIn - rowHeight * (rowIndex + 1);

    for (const p of inRow) {
      const outerW = p.widthIn + p.frameWidthIn * 2;
      placements.push({
        posterId: p.id,
        centerXIn: Math.round((x + outerW / 2) * 10) / 10,
        centerYIn: Math.round(y * 10) / 10,
      });
      x += outerW + gap;
    }
  });

  return placements;
}

function poster(id, name, widthIn, heightIn, frameWidthIn, frameColor, shape = 'rect') {
  return { id, name, widthIn, heightIn, frameWidthIn, frameColor, shape };
}

const SAMPLES = [
  {
    id: 'sample-stairwell-gallery',
    name: 'Stairwell gallery',
    wall: { id: 'w1', name: 'Stairwell', widthIn: 120, heightIn: 108, backgroundColor: '#E8E2D8', obstructions: [] },
    posters: [
      poster('s1-a', 'Yosemite', 18, 24, 1, BLACK),
      poster('s1-b', 'Big Sur', 18, 24, 1, BLACK),
      poster('s1-c', 'Zion', 18, 24, 1, BLACK),
      poster('s1-d', 'Acadia', 12, 18, 1, BLACK),
      poster('s1-e', 'Olympic', 12, 18, 1, BLACK),
    ],
    rows: [3, 2],
  },
  {
    id: 'sample-record-wall',
    name: 'Record wall',
    wall: { id: 'w1', name: 'Behind the turntable', widthIn: 96, heightIn: 84, backgroundColor: '#1F2937', obstructions: [] },
    posters: [
      poster('s2-a', 'Kind of Blue', 12, 12, 0, WHITE, 'circle'),
      poster('s2-b', 'Rumours', 12, 12, 0, WHITE, 'circle'),
      poster('s2-c', 'Aja', 12, 12, 0, WHITE, 'circle'),
      poster('s2-d', 'Blue Train', 12, 12, 0, WHITE, 'circle'),
      poster('s2-e', 'Abbey Road', 12, 12, 0, WHITE, 'circle'),
      poster('s2-f', 'Innervisions', 12, 12, 0, WHITE, 'circle'),
    ],
    rows: [3, 3],
  },
  {
    id: 'sample-concert-posters',
    name: 'Concert posters',
    wall: { id: 'w1', name: 'Living room', widthIn: 144, heightIn: 96, backgroundColor: '#F5F3EF', obstructions: [
      { id: 'o1', kind: 'outlet', label: 'Outlet', xIn: 6, yIn: 12, widthIn: 4, heightIn: 5 },
    ] },
    posters: [
      poster('s3-a', 'Radiohead', 18, 24, 1.5, WALNUT),
      poster('s3-b', 'Portishead', 18, 24, 1.5, WALNUT),
      poster('s3-c', 'Massive Attack', 18, 24, 1.5, WALNUT),
      poster('s3-d', 'Sigur Ros', 18, 24, 1.5, WALNUT),
    ],
    rows: [4],
  },
  {
    id: 'sample-hallway-run',
    name: 'Hallway run',
    wall: { id: 'w1', name: 'Upstairs hall', widthIn: 180, heightIn: 90, backgroundColor: '#FFFFFF', obstructions: [
      { id: 'o1', kind: 'door', label: 'Bedroom', xIn: 0, yIn: 0, widthIn: 32, heightIn: 80 },
    ] },
    posters: [
      poster('s4-a', 'Botanical I', 16, 20, 1, OAK),
      poster('s4-b', 'Botanical II', 16, 20, 1, OAK),
      poster('s4-c', 'Botanical III', 16, 20, 1, OAK),
      poster('s4-d', 'Botanical IV', 16, 20, 1, OAK),
    ],
    rows: [4],
  },
  {
    id: 'sample-bedroom-pair',
    name: 'Above the bed',
    wall: { id: 'w1', name: 'Bedroom', widthIn: 132, heightIn: 96, backgroundColor: '#DDE5EC', obstructions: [] },
    posters: [
      poster('s5-a', 'Coastline', 24, 36, 0.75, BLACK),
      poster('s5-b', 'Dunes', 24, 36, 0.75, BLACK),
    ],
    rows: [2],
  },
];

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

for (const sample of SAMPLES) {
  const pk = `PROJECT#${sample.id}`;
  const placements = grid(sample.wall, sample.posters, sample.rows);

  await client.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK: pk, SK: 'META',
      id: sample.id,
      ownerId: DEMO_OWNER,
      name: sample.name,
      visibility: 'public',
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      // Sparse browse index. Only public projects carry these.
      GSI1PK: 'PUBLIC',
      GSI1SK: `${NOW}#${sample.id}`,
    },
  }));

  await client.send(new PutCommand({
    TableName: TABLE,
    Item: { PK: pk, SK: `WALL#${sample.wall.id}`, ...sample.wall },
  }));

  for (const p of sample.posters) {
    await client.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: pk, SK: `POSTER#${p.id}`, ...p },
    }));
  }

  await client.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK: pk,
      SK: `LAYOUT#${sample.wall.id}#default`,
      wallId: sample.wall.id,
      layoutId: 'default',
      placements,
    },
  }));

  console.log(
    `${sample.name.padEnd(22)} ${sample.wall.widthIn}x${sample.wall.heightIn}  ` +
      `${sample.posters.length} posters, ${placements.length} hung`,
  );
}

console.log(`\nseeded ${SAMPLES.length} public sample projects as "${DEMO_OWNER}"`);
