import { z } from 'zod';

export const ProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give your project a name.')
    .max(80, 'Use 80 characters or fewer.'),
  description: z.string().trim().max(400, 'Use 400 characters or fewer.'),
});
