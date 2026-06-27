"""
API测试用例
使用pytest运行: pytest tests/test_api.py -v
"""
import pytest
import os
import sys
import tempfile
from io import BytesIO

# 添加后端目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 使用临时目录创建测试数据库
temp_dir = tempfile.mkdtemp()
test_db_path = os.path.join(temp_dir, "test_database.db")
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"

from fastapi.testclient import TestClient
from sqlmodel import SQLModel

from config import engine
from app import app


@pytest.fixture(scope="function")
def client():
    """为每个测试创建新的数据库表"""
    # 重建表
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    yield TestClient(app)


class TestHealthCheck:
    """健康检查测试"""

    def test_health_endpoint(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "database" in data


class TestUserAPI:
    """用户API测试"""

    def test_register_new_user(self, client):
        """测试新用户注册"""
        response = client.post("/api/users/register", json={"username": "testuser"})
        assert response.status_code == 200
        data = response.json()
        assert data["is_new"] == True
        assert "user_id" in data

    def test_register_existing_user(self, client):
        """测试已存在用户登录"""
        # 首次注册
        client.post("/api/users/register", json={"username": "existinguser"})
        # 再次登录
        response = client.post("/api/users/register", json={"username": "existinguser"})
        assert response.status_code == 200
        data = response.json()
        assert data["is_new"] == False

    def test_get_user(self, client):
        """测试获取用户信息"""
        # 先注册用户
        client.post("/api/users/register", json={"username": "getuser"})
        # 获取用户
        response = client.get("/api/users/getuser")
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "getuser"

    def test_get_nonexistent_user(self, client):
        """测试获取不存在的用户"""
        response = client.get("/api/users/nonexistent")
        assert response.status_code == 404


class TestWorldAPI:
    """世界配置API测试"""

    def test_create_world(self, client):
        """测试创建世界"""
        # 先注册用户
        reg_response = client.post("/api/users/register", json={"username": "worlduser"})
        user_id = reg_response.json()["user_id"]

        # 创建世界
        response = client.post(f"/api/worlds/{user_id}", json={
            "name": "测试世界",
            "greeting_message": "你好!"
        })
        assert response.status_code == 200
        assert "world_id" in response.json()

    def test_get_user_worlds(self, client):
        """测试获取用户世界列表"""
        # 注册用户（会自动创建默认世界）
        reg_response = client.post("/api/users/register", json={"username": "worldsuser"})
        user_id = reg_response.json()["user_id"]

        # 获取世界列表
        response = client.get(f"/api/worlds/{user_id}")
        assert response.status_code == 200
        worlds = response.json()
        assert len(worlds) >= 1  # 至少有一个默认世界

    def test_update_world(self, client):
        """测试更新世界配置"""
        # 注册用户
        reg_response = client.post("/api/users/register", json={"username": "updateuser"})
        user_id = reg_response.json()["user_id"]

        # 创建世界
        create_response = client.post(f"/api/worlds/{user_id}", json={"name": "原始世界"})
        world_id = create_response.json()["world_id"]

        # 更新世界
        response = client.put(f"/api/worlds/{world_id}", json={
            "name": "更新后的世界",
            "greeting_message": "新的问候语"
        })
        assert response.status_code == 200

        # 验证更新
        detail_response = client.get(f"/api/worlds/detail/{world_id}")
        detail = detail_response.json()
        assert detail["name"] == "更新后的世界"
        assert detail["greeting_message"] == "新的问候语"


class TestFileUpload:
    """文件上传测试"""

    def test_upload_sky_texture(self, client):
        """测试上传天空贴图"""
        # 注册用户并创建世界
        reg_response = client.post("/api/users/register", json={"username": "uploaduser"})
        user_id = reg_response.json()["user_id"]
        create_response = client.post(f"/api/worlds/{user_id}", json={"name": "上传测试世界"})
        world_id = create_response.json()["world_id"]

        # 创建测试图片文件
        test_image = BytesIO(b"fake image content")

        response = client.post(
            f"/api/upload/sky-texture/{world_id}",
            files={"file": ("test.jpg", test_image, "image/jpeg")}
        )
        assert response.status_code == 200
        assert "path" in response.json()

    def test_upload_invalid_file_type(self, client):
        """测试上传不支持的文件类型"""
        # 注册用户并创建世界
        reg_response = client.post("/api/users/register", json={"username": "invaliduser"})
        user_id = reg_response.json()["user_id"]
        create_response = client.post(f"/api/worlds/{user_id}", json={"name": "测试世界"})
        world_id = create_response.json()["world_id"]

        # 尝试上传不支持的文件
        test_file = BytesIO(b"fake content")
        response = client.post(
            f"/api/upload/sky-texture/{world_id}",
            files={"file": ("test.exe", test_file, "application/octet-stream")}
        )
        assert response.status_code == 400


class TestFeedbackAPI:
    """反馈API测试"""

    def test_submit_feedback(self, client):
        """测试提交反馈"""
        # 注册用户
        reg_response = client.post("/api/users/register", json={"username": "feedbackuser"})
        user_id = reg_response.json()["user_id"]

        # 提交反馈
        response = client.post(f"/api/feedback?user_id={user_id}", json={
            "feedback_type": "feature_request",
            "title": "测试反馈",
            "content": "这是一个测试反馈内容"
        })
        assert response.status_code == 200

    def test_get_user_feedback(self, client):
        """测试获取用户反馈"""
        # 注册用户
        reg_response = client.post("/api/users/register", json={"username": "getfeedbackuser"})
        user_id = reg_response.json()["user_id"]

        # 提交反馈
        client.post(f"/api/feedback?user_id={user_id}", json={
            "feedback_type": "bug_report",
            "title": "Bug报告",
            "content": "发现一个bug"
        })

        # 获取反馈
        response = client.get(f"/api/feedback/{user_id}")
        assert response.status_code == 200
        feedbacks = response.json()
        assert len(feedbacks) >= 1


class TestShareAPI:
    """分享API测试"""

    def test_share_world(self, client):
        """测试分享世界"""
        # 注册用户并创建世界
        reg_response = client.post("/api/users/register", json={"username": "shareuser"})
        user_id = reg_response.json()["user_id"]
        create_response = client.post(f"/api/worlds/{user_id}", json={"name": "分享测试世界"})
        world_id = create_response.json()["world_id"]

        # 分享世界
        response = client.post(f"/api/share/{world_id}")
        assert response.status_code == 200
        assert "share_code" in response.json()

    def test_get_shared_world(self, client):
        """测试获取分享的世界"""
        # 注册用户并创建世界
        reg_response = client.post("/api/users/register", json={"username": "getshareuser"})
        user_id = reg_response.json()["user_id"]
        create_response = client.post(f"/api/worlds/{user_id}", json={"name": "获取分享测试"})
        world_id = create_response.json()["world_id"]

        # 分享世界
        share_response = client.post(f"/api/share/{world_id}")
        share_code = share_response.json()["share_code"]

        # 获取分享的世界
        response = client.get(f"/api/share/{share_code}")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "获取分享测试"


class TestDatabaseAdmin:
    """数据库管理测试"""

    def test_get_db_info(self, client):
        """测试获取数据库信息"""
        response = client.get("/api/admin/db-info")
        assert response.status_code == 200
        data = response.json()
        assert "type" in data

    def test_db_reset_requires_confirm(self, client):
        """测试数据库重置需要确认"""
        response = client.post("/api/admin/db-reset")
        assert response.status_code == 400

    def test_db_migrate(self, client):
        """测试数据库迁移"""
        response = client.post("/api/admin/db-migrate")
        assert response.status_code == 200


class TestPlaceholderRoutes:
    """预留路由测试"""

    def test_my_worlds_placeholder(self, client):
        """测试我的世界占位路由"""
        response = client.get("/api/my-worlds")
        assert response.status_code == 200
        assert response.json()["status"] == "placeholder"

    def test_explore_placeholder(self, client):
        """测试探索世界占位路由"""
        response = client.get("/api/explore")
        assert response.status_code == 200
        assert response.json()["status"] == "placeholder"

    def test_forgot_password_placeholder(self, client):
        """测试忘记密码占位路由"""
        response = client.post("/api/auth/forgot-password")
        assert response.status_code == 200
        assert response.json()["status"] == "placeholder"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
