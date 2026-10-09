using Amazon;
using Amazon.S3;
using Amazon.S3.Transfer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using System;
using System.IO;
using System.Threading.Tasks;

namespace SocialConnect.Services
{
    public class S3StorageService : IStorageService
    {
        private readonly IConfiguration _config;
        private readonly string _bucketName;
        private readonly string _region;
        private readonly string _accessKey;
        private readonly string _secretKey;

        public S3StorageService(IConfiguration config)
        {
            _config = config;
            _bucketName = _config["Storage:S3:BucketName"] ?? "socialconnect-media";
            _region = _config["Storage:S3:Region"] ?? "us-east-1";
            _accessKey = _config["Storage:S3:AccessKey"] ?? "";
            _secretKey = _config["Storage:S3:SecretKey"] ?? "";
        }

        private IAmazonS3 CreateS3Client()
        {
            var regionEndpoint = RegionEndpoint.GetBySystemName(_region);
            if (!string.IsNullOrWhiteSpace(_accessKey) && !string.IsNullOrWhiteSpace(_secretKey))
            {
                return new AmazonS3Client(_accessKey, _secretKey, regionEndpoint);
            }
            // Use IAM Role / EC2 environment credentials
            return new AmazonS3Client(regionEndpoint);
        }

        public async Task<string> SaveFileAsync(IFormFile file, string category, string uniqueFileName)
        {
            var key = $"uploads/{category}/{uniqueFileName}";

            using var s3Client = CreateS3Client();
            using var stream = file.OpenReadStream();

            var fileTransferUtility = new TransferUtility(s3Client);
            await fileTransferUtility.UploadAsync(stream, _bucketName, key);

            return $"https://{_bucketName}.s3.{_region}.amazonaws.com/{key}";
        }

        public async Task DeleteFileAsync(string filePath)
        {
            if (string.IsNullOrEmpty(filePath)) return;

            try
            {
                using var s3Client = CreateS3Client();
                var uri = new Uri(filePath);
                var key = uri.AbsolutePath.TrimStart('/');
                await s3Client.DeleteObjectAsync(_bucketName, key);
            }
            catch {}
        }
    }
}
