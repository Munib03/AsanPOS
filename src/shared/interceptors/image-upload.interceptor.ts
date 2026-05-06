import { BadRequestException } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';

export const ImageUploadInterceptor = FileInterceptor('image', {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/))
      cb(new BadRequestException('Only image files are allowed'), false);
    else
      cb(null, true);
  },
});

export const ImagesUploadInterceptor = FilesInterceptor('images', 100, {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/))
      cb(new BadRequestException('Only image files are allowed'), false);
    else
      cb(null, true);
  },
});