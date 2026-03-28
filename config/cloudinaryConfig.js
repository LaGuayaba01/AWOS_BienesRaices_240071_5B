/**
 * cloudinaryConfig.js
 * ─────────────────────────────────────────────────────────────────
 * Configuracion de Cloudinary para subida de imagenes.
 * ─────────────────────────────────────────────────────────────────
 */

import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder:          'bienesraices',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation:  [{ width: 1200, height: 800, crop: 'limit', quality: 'auto' }]
    }
});

// Maximo 5 imagenes, 5MB cada una
export const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
        if (permitidos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imagenes JPG, PNG o WebP'));
        }
    }
});

export default cloudinary;
