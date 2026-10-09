using Microsoft.EntityFrameworkCore;
using SocialConnect.Data;
using SocialConnect.Models;

namespace SocialConnect.Services
{
    public class FileService : IFileService
    {
        private readonly ApplicationDbContext _db;
        private readonly IStorageService _storage;

        private static readonly string[] DisallowedExtensions = new[]
        {
            ".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".msi", ".scr", ".com"
        };

        public FileService(ApplicationDbContext db, IStorageService storage)
        {
            _db = db;
            _storage = storage;
        }

        public async Task<FileRecord> UploadFileAsync(IFormFile file, Guid uploadedById, string category = "files")
        {
            if (file == null || file.Length == 0)
            {
                throw new ArgumentException("File is empty.");
            }

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (DisallowedExtensions.Contains(extension))
            {
                throw new InvalidOperationException($"Files with extension '{extension}' are not allowed for security reasons.");
            }

            // Category & File Size Limits
            category = category.ToLowerInvariant().Trim();
            long maxAllowedSize = 25 * 1024 * 1024; // Default 25 MB

            if (category == "images" || new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp" }.Contains(extension))
            {
                category = "images";
                maxAllowedSize = 10 * 1024 * 1024; // 10 MB limit for images
            }
            else if (category == "videos" || new[] { ".mp4", ".webm", ".mov", ".m4v" }.Contains(extension))
            {
                category = "videos";
                maxAllowedSize = 100 * 1024 * 1024; // 100 MB limit for videos
            }
            else if (category == "audio" || new[] { ".mp3", ".wav", ".ogg", ".webm", ".m4a" }.Contains(extension))
            {
                category = "audio";
                maxAllowedSize = 20 * 1024 * 1024; // 20 MB limit for audio
            }

            if (file.Length > maxAllowedSize)
            {
                throw new InvalidOperationException($"File size exceeds the maximum limit of {maxAllowedSize / (1024 * 1024)}MB for {category}.");
            }

            var uniqueFileName = $"{Guid.NewGuid()}{extension}";
            var relativePath = await _storage.SaveFileAsync(file, category, uniqueFileName);

            var user = await _db.Users.FirstAsync(u => u.Id == uploadedById);

            var fileRecord = new FileRecord
            {
                Id = Guid.NewGuid(),
                FileName = Path.GetFileName(file.FileName),
                StoredFileName = uniqueFileName,
                FilePath = relativePath,
                FileType = file.ContentType ?? "application/octet-stream",
                FileSize = file.Length,
                UploadedById = uploadedById,
                UploadedBy = user,
                UploadedAt = DateTime.UtcNow
            };

            _db.Files.Add(fileRecord);
            await _db.SaveChangesAsync();

            return fileRecord;
        }

        public async Task<FileRecord?> GetFileAsync(Guid fileId)
        {
            return await _db.Files.Include(f => f.UploadedBy).FirstOrDefaultAsync(f => f.Id == fileId);
        }
    }
}
