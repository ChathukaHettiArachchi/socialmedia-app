using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace SocialConnect.Services
{
    public interface IStorageService
    {
        Task<string> SaveFileAsync(IFormFile file, string category, string uniqueFileName);
        Task DeleteFileAsync(string filePath);
    }
}
