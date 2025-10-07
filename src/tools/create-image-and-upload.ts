import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import fetch from 'node-fetch';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const BASE_URL = 'https://api-inference.modelscope.cn/';
const API_KEY = process.env.MODELSCOPE_API_KEY;

const s3 = new S3Client({
  region: "nyc3", // DO 要求写个 region
  endpoint: process.env.DO_SPACE_ENDPOINT,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.DO_SPACE_KEY!,
    secretAccessKey: process.env.DO_SPACE_SECRET!,
  },
});

export function createImageAndUploadToDO(server: McpServer): RegisteredTool {
  return server.tool(
    'create-image-to-do',
    'Generate an image from a natural language description using ModelScope API and upload it to DigitalOcean Spaces. By default, it generates a JPEG image.',
    {
      prompt: z.string().describe('A natural language description of the image to generate.'),
      filename: z.string().describe('Optional: original filename (extension will be preserved if present).').optional(),
    },
    {
      title: 'Create image to DO Spaces',
      readOnlyHint: false,
      destructiveHint: true
    } as ToolAnnotations,
    async ({ prompt, filename }, req) =>
      handleCreateImageAndUpload(prompt, filename)
  );
}

async function handleCreateImageAndUpload(
  prompt: string,
  filename?: string
): Promise<CallToolResult> {
  try {
    // Step 1: 调用 ModelScope 生成图片
    const genResp = await fetch(`${BASE_URL}v1/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-ModelScope-Async-Mode': 'true'
      },
      body: JSON.stringify({
        model: 'MusePublic/Qwen-image',
        prompt
      })
    });
    if (!genResp.ok) {
      throw new Error(`Image generation request failed: ${genResp.status}`);
    }
    const genData = await genResp.json() as { task_id?: string };
    const taskId = genData.task_id;
    if (!taskId) {
      throw new Error('Image generation task_id not returned');
    }

    // Step 2: 轮询任务结果
    let imageUrl: string | null = null;
    for (;;) {
      const taskResp = await fetch(`${BASE_URL}v1/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'X-ModelScope-Task-Type': 'image_generation'
        }
      });
      if (!taskResp.ok) {
        throw new Error(`Polling task failed: ${taskResp.status}`);
      }
      const taskData = await taskResp.json() as { task_status: string; output_images?: string[] };
      if (taskData.task_status === 'SUCCEED') {
        imageUrl = taskData.output_images?.[0] ?? null;
        break;
      } else if (taskData.task_status === 'FAILED') {
        throw new Error('Image generation failed on ModelScope');
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (!imageUrl) {
      throw new Error('Image URL not returned from generation task');
    }

    // Step 3: 下载生成的图片
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) {
      throw new Error(`Failed to download generated image: ${imgResp.status}`);
    }
    const buffer = await imgResp.buffer();

    // Step 4: 上传到 DigitalOcean Spaces
    const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32);
    const ext = filename?.split(".").pop() || "jpg";
    const key = `${hash}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.DO_SPACE_BUCKET!,
        Key: key,
        Body: buffer,
        ContentType: "image/jpeg",
        ACL: "public-read",
      })
    );

    const publicUrl = `${process.env.DO_SPACE_ENDPOINT!.replace(/^https?:\/\//,"https://")}/${process.env.DO_SPACE_BUCKET}/${key}`;

    return {
      content: [
        { type: "text", text: `✅ Image generated and uploaded successfully` },
        { type: "text", text: `Prompt: ${prompt}` },
        { type: "text", text: `File: ${key}` },
        { type: "text", text: `Public URL: ${publicUrl}` }
      ]
    };

  } catch (error) {
    return {
      content: [
        { type: 'text', text: `Failed to create image to DO: ${(error as Error).message}` }
      ],
      isError: true
    };
  }
}
