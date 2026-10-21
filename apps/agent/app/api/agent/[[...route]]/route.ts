import { handle } from 'hono/vercel';
import { createApp } from '../../../../src/app';

export const runtime = 'nodejs';
export const maxDuration = 800;

const handler = handle(createApp());

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const PATCH = handler;
