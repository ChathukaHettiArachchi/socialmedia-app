using Microsoft.AspNetCore.Http;
using SocialConnect.Models;

namespace SocialConnect.Services
{
    public interface IFileService
    {
        Task<FileRecord> UploadFileAsync(IFormFile file, Guid uploadedById, string category = "files");
        Task<FileRecord?> GetFileAsync(Guid fileId);
    }
}
