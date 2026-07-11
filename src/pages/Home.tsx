import '@/styles/home.scss';
import BackgroundImg from '@/components/home/BackgroundImg';

function Home() {
  return (
    <section className="home" id="home">
      <Header />
      {/* <!-- ===== 背景图片 ===== --> */}
      <BackgroundImg />
    </section>
  );
}

export default Home;
