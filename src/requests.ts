import { HeadersInit } from 'node-fetch';
import { requestJson as request, apiFailure } from './http';
import { AppError } from './status';
import { userAgent } from './consts';

const baseHeaders: HeadersInit = {
  'User-Agent': userAgent,
  'Content-Type': 'application/json',
  Accept: '*/*',
  'Accept-Language': 'zh-CN,en-US;qbaseHeaders=0.7,en;q=0.3',
};

export interface IBasicSignInfo {
  courseId: number;
  signId: number;
}

export interface IActiveSign extends IBasicSignInfo {
  isGPS?: 1 | 0;
  isQR?: 1 | 0;
  name: string;
  code: string;
  startYear: number;
  term: string;
  cover: string; // url
}

export type ActiveSignResp = IActiveSign[];

export const activeSign = (openId: string, signal?: AbortSignal) =>
  request<ActiveSignResp>(
    'https://v18.teachermate.cn/wechat-api/v1/class-attendance/student/active_signs',
    {
      headers: {
        ...baseHeaders,
        openId,
        Referrer: `https://v18.teachermate.cn/wechat-pro-ssr/student/sign?openid=${openId}`,
      },
      method: 'GET',
      signal,
    }
  ).then(data => {
    if (!Array.isArray(data) || !data.every(sign => sign &&
      Number.isFinite(sign.courseId) && Number.isFinite(sign.signId) && typeof sign.name === 'string')) {
      throw apiFailure('查询签到', data);
    }
    return data;
  });

export interface ISignInQuery {
  courseId: number;
  signId: number;
  lon?: number;
  lat?: number;
}
export interface ISignInResp {
  errorCode?: number;
  message?: string;
}

export const signIn = (openId: string, query: ISignInQuery, signal?: AbortSignal) =>
  request<ISignInResp>(
    'https://v18.teachermate.cn/wechat-api/v1/class-attendance/student-sign-in',
    {
      headers: {
        ...baseHeaders,
        openId,
        Referrer: `https://v18.teachermate.cn/wechat-pro-ssr/student/sign?openid=${openId}`,
      },
      body: JSON.stringify(query),
      method: 'POST',
      signal,
    }
  ).then(data => {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        (data.errorCode !== undefined && data.errorCode !== 0 && data.errorCode !== 305) ||
        ('message' in data && data.errorCode !== 0 && data.errorCode !== 305)) {
      throw apiFailure('提交签到', data);
    }
    return data;
  });

interface IStudentRole {
  id: number;
  student_id: number;
  college_id: number;
  department_id: number;
  class_name: string;
  specialty: string;
  student_number: string;
  comment: any;
  deleted: number;
  org_id: any;
  college_name: string;
  department_name: string;
}

type StudentRoleResp = IStudentRole[] | { message: string };

export const studentsRole = (openId: string, signal?: AbortSignal) =>
  request<StudentRoleResp>(
    'https://v18.teachermate.cn/wechat-api/v2/students/role',
    {
      headers: {
        ...baseHeaders,
        openId,
        Referrer: `https://v18.teachermate.cn/wechat-pro/student/archive/lists?openid=${openId}`,
      },
      method: 'GET',
      signal,
    }
  );

const studentInfo = (openId: string, signal?: AbortSignal) =>
  request<Record<'item_name' | 'item_value', string>[][]>(
    'https://v18.teachermate.cn/wechat-api/v2/students',
    {
      headers: {
        ...baseHeaders,
        openId,
        Referrer: `https://v18.teachermate.cn/wechat-pro/student/edit?openid=${openId}`,
      },
      method: 'GET',
      signal,
    }
  );

export const getStudentName = async (openId: string, signal?: AbortSignal) => {
  const response = await studentInfo(openId, signal);
  if (!Array.isArray(response) || !Array.isArray(response[0])) throw apiFailure('获取学生姓名', response);
  const name = response[0].find(item => item && item.item_name === 'name')?.item_value;
  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError('action', '未找到学生姓名，无法可靠识别二维码签到结果。',
      ['在微信微助教中检查学生身份和姓名，再获取新 URL 并重启', '修复接口适配后重启程序']);
  }
  return name;
};

export const validateSession = async (openId: string, signal?: AbortSignal) => {
  const response = await studentsRole(openId, signal);
  if (!Array.isArray(response)) throw apiFailure('验证 openId', response);
  if (response.length === 0) {
    throw new AppError('action', '当前账号未返回学生身份；无法确认是凭据失效还是账号尚未绑定。',
      ['在微信检查账号和学生身份绑定，再获取新 URL 后重启', '使用正确的微信账号获取新 URL 后重启']);
  }
};
