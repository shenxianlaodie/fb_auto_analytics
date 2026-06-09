import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Loading } from '../components/Common/Loading';
import { Result, Button } from 'antd';

export const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (token) {
      setAuth(token, '');
      sessionStorage.setItem('accounts_refresh', '1');
      navigate('/connect-facebook', { replace: true });
    }

    if (error) {
      // Error state is shown below
    }
  }, [searchParams]);

  const error = searchParams.get('error');

  if (error) {
    return (
      <Result
        status="error"
        title="登录失败"
        subTitle={decodeURIComponent(error)}
        extra={[
          <Button type="primary" key="retry" onClick={() => navigate('/login')}>
            重新登录
          </Button>,
        ]}
      />
    );
  }

  return <Loading tip="正在完成登录..." fullScreen />;
};
